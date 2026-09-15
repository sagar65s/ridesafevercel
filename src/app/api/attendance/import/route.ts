import {NextRequest,NextResponse} from 'next/server'
import prisma from '@/lib/prisma'
import {getCurrentUser} from '@/lib/authorization'
import {parseImportDate,readTabularFile} from '@/lib/tabular-import'
import {writeAuditLog} from '@/lib/audit'
import {createHash} from 'node:crypto'
import {ARCHIVE_MIGRATION_ERROR,isArchiveTableMissing} from '@/lib/attendance-archive'

export const runtime='nodejs'
const actionFor=(value:string)=>{const key=value.trim().toUpperCase().replace(/[\s-]+/g,'_');return ({PICKED:'PICKED_UP',BOARDED:'PICKED_UP',ON_BOARD:'PICKED_UP',DROPPED:'DROPPED_OFF',DROPPED_OFF:'DROPPED_OFF',ABSENT:'ABSENT',NOTMARKED:'NOT_MARKED'} as Record<string,string>)[key]||key}
const serviceFor=(value:string)=>{const key=(value||'MORNING').trim().toUpperCase().replace(/[\s-]+/g,'_');return ({AFTERNOON:'PM',AFTER_SCHOOL_ACTIVITY:'AFTER_SCHOOL',AFTERSCHOOL:'AFTER_SCHOOL'} as Record<string,string>)[key]||key}

export async function POST(request:NextRequest){
  const actor=await getCurrentUser()
  if(!actor||!['SUPER_ADMIN','SCHOOL_ADMIN'].includes(actor.role))return NextResponse.json({error:'Only Super Admin and School Admin can import attendance'},{status:403})
  try{
    const form=await request.formData(),file=form.get('file')
    if(!(file instanceof File))return NextResponse.json({error:'Choose an attendance Excel or CSV file'},{status:400})
    const requested=String(form.get('organizationId')||''),organizationId=actor.role==='SUPER_ADMIN'?requested:actor.organizationId
    if(!organizationId)return NextResponse.json({error:'Select a school before importing attendance'},{status:400})
    if(actor.role!=='SUPER_ADMIN'&&requested&&requested!==organizationId)return NextResponse.json({error:'Forbidden'},{status:403})
    const {rows}=await readTabularFile(file,{rows:5000,columns:40})
    const [trips,students]=await Promise.all([
      prisma.trip.findMany({where:{route:{organizationId}},include:{route:true,bus:true}}),
      prisma.student.findMany({where:{organizationId},select:{id:true,name:true,studentCode:true,routeId:true,busId:true,pickupStopId:true,dropoffStopId:true}}),
    ])
    const records:{tripId:string;studentId:string;stopId:string|null;action:string;timestamp:Date;recordedById:string;dedupeKey:string}[]=[]
    const archived:{organizationId:string;sourceKey:string;date:Date;session:string;status:string;studentName:string;studentCode:string|null;matchedStudentId:string|null;routeName:string|null;busLabel:string|null;time:string|null;sourceFile:string;importedById:string}[]=[]
    const errors:{row:number;error:string}[]=[]
    const warnings:{row:number;error:string}[]=[]
    for(const row of rows){
      const status=actionFor(row.value('Status','Attendance Status'))
      if(!status)continue
      if(!['PICKED_UP','DROPPED_OFF','ABSENT','NOT_MARKED'].includes(status)){errors.push({row:row.row,error:'Unsupported status'});continue}
      const day=parseImportDate(row.value('Date'),row.row),session=serviceFor(row.value('Session','Service Type'))
      if(!['MORNING','PM','AFTER_SCHOOL'].includes(session)){errors.push({row:row.row,error:'Unsupported service type'});continue}
      const routeText=row.value('Route','Route Name'),busText=row.value('Bus','Bus Number','Bus Plate'),studentCode=row.value('Student ID','Student Code'),studentText=row.value('Student','Student Name').replace(/\s+\([^)]*\)$/,'').trim()
      if(!studentText&&!studentCode){errors.push({row:row.row,error:'Student name or Student ID required'});continue}
      const trip=trips.find(item=>item.date.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})===day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})&&item.serviceType===session&&(!routeText||item.route.name.toLowerCase()===routeText.toLowerCase())&&(!busText||[item.bus?.busNumber,item.bus?.plateNumber].some(value=>value?.toLowerCase()===busText.toLowerCase())))
      const candidates=students.filter(item=>studentCode?item.studentCode?.toLowerCase()===studentCode.toLowerCase():item.name.toLowerCase()===studentText.toLowerCase())
      const student=trip?candidates.find(item=>item.routeId===trip.routeId&&item.busId===trip.busId):null
      if(!trip||!student){
        const reason=!trip?'No matching recorded trip':'Student is not assigned to the matching trip'
        const date=day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})
        const time=row.value('Time').trim()
        const sourceKey=createHash('sha256').update(JSON.stringify([date,session,status,studentCode.toLowerCase(),studentText.toLowerCase(),routeText.toLowerCase(),busText.toLowerCase(),time])).digest('hex')
        archived.push({organizationId,sourceKey,date:day,session,status,studentName:studentText||studentCode,studentCode:studentCode||null,matchedStudentId:candidates.length===1?candidates[0].id:null,routeName:routeText||null,busLabel:busText||null,time:time||null,sourceFile:file.name.slice(0,200),importedById:actor.id})
        warnings.push({row:row.row,error:`${reason}; saved separately as an uploaded historical row, not a live trip attendance`})
        continue
      }
      if(status==='NOT_MARKED')continue
      const time=/^\d{1,2}:\d{2}$/.test(row.value('Time'))?row.value('Time'):'12:00',timestamp=new Date(`${day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})}T${time}:00+08:00`)
      const actions=status==='DROPPED_OFF'?['PICKED_UP','DROPPED_OFF']:[status]
      for(const action of actions)records.push({tripId:trip.id,studentId:student.id,stopId:action==='DROPPED_OFF'?student.dropoffStopId:student.pickupStopId,action,timestamp,recordedById:actor.id,dedupeKey:`attendance-import:${trip.id}:${student.id}:${action}`})
    }
    // Check the new table before writing live rows. An older Vercel database
    // must not leave a half-imported file when both row types are present.
    if(archived.length)await prisma.attendanceImportRecord.count({where:{organizationId,sourceKey:'__archive_schema_check__'}})
    const {created,historical}=await prisma.$transaction(async tx=>{
      const created=records.length?await tx.attendance.createMany({data:records,skipDuplicates:true}):{count:0}
      const historical=archived.length?await tx.attendanceImportRecord.createMany({data:archived,skipDuplicates:true}):{count:0}
      return {created,historical}
    })
    if(created.count||historical.count)try{await writeAuditLog({actorId:actor.id,organizationId,action:'IMPORT',entityType:'ATTENDANCE',details:{created:created.count,archived:historical.count,skipped:errors.length,fileName:file.name}})}catch(auditError){console.error('Attendance import succeeded but audit delivery failed:',auditError)}
    return NextResponse.json({created:created.count,archived:historical.count,archiveDate:archived[0]?.date.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})||null,skipped:errors.length,duplicates:records.length-created.count+archived.length-historical.count,errors:errors.slice(0,50),warnings:warnings.slice(0,50)})
  }catch(error){
    if(isArchiveTableMissing(error))return NextResponse.json({error:ARCHIVE_MIGRATION_ERROR,code:'MIGRATION_REQUIRED'},{status:503})
    if(error instanceof Error&&(/Invalid date on row|Choose a file|Use Excel|Use one header|Formulas are not accepted|\.xlsx|\.csv|Workbook|row \d+/.test(error.message)))return NextResponse.json({error:error.message},{status:400})
    console.error('Attendance import failed:',error)
    return NextResponse.json({error:'Unable to import attendance. Check the file and the school assignments, then try again.'},{status:500})
  }
}

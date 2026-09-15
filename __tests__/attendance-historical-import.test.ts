import {NextRequest} from 'next/server'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

jest.mock('@/lib/authorization',()=>({getCurrentUser:jest.fn()}))
jest.mock('@/lib/audit',()=>({writeAuditLog:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{
  trip:{findMany:jest.fn()},student:{findMany:jest.fn()},attendance:{createMany:jest.fn()},attendanceImportRecord:{createMany:jest.fn(),count:jest.fn()},$transaction:jest.fn(),
}}))

import prisma from '@/lib/prisma'
import {getCurrentUser} from '@/lib/authorization'
import {POST} from '@/app/api/attendance/import/route'

const mock=(value:unknown)=>value as jest.Mock
const upload=async(status='Absent')=>{
  const form=new FormData()
  form.set('file',new File([`Date,Session,Route,Bus,Student,Student ID,Status,Time\n15/09/2026,AFTERNOON,Route A,BUS-001,Amy Student,STU-1,${status},12:00`],'attendance.csv'))
  return POST(new NextRequest('http://localhost/api/attendance/import',{method:'POST',body:form}))
}

beforeEach(()=>{
  jest.resetAllMocks()
  mock(getCurrentUser).mockResolvedValue({id:'staff',role:'SCHOOL_ADMIN',organizationId:'school-a'})
  mock(prisma.trip.findMany).mockResolvedValue([])
  mock(prisma.student.findMany).mockResolvedValue([{id:'child',name:'Amy Student',studentCode:'STU-1',routeId:null,busId:null,pickupStopId:null,dropoffStopId:null}])
  mock(prisma.attendanceImportRecord.createMany).mockResolvedValue({count:1})
  mock(prisma.attendanceImportRecord.count).mockResolvedValue(0)
  mock(prisma.$transaction).mockImplementation(async work=>work(prisma))
  mock(prisma.attendance.createMany).mockResolvedValue({count:0})
})

test('uploaded old-school attendance without a recorded trip is saved separately, not silently skipped',async()=>{
  const response=await upload()
  const data=await response.json()
  expect(response.status).toBe(200)
  expect(data).toMatchObject({created:0,archived:1,skipped:0,archiveDate:'2026-09-15'})
  expect(prisma.attendance.createMany).not.toHaveBeenCalled()
  expect(prisma.attendanceImportRecord.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({organizationId:'school-a',session:'PM',status:'ABSENT',matchedStudentId:'child'})],skipDuplicates:true})
})

test('verified date, bus, route and assigned student still import into the real trip',async()=>{
  mock(prisma.trip.findMany).mockResolvedValue([{id:'trip-1',date:new Date('2026-09-15T00:00:00+08:00'),serviceType:'PM',routeId:'route-a',busId:'bus-a',route:{name:'Route A'},bus:{busNumber:'BUS-001',plateNumber:'BUS-001'}}])
  mock(prisma.student.findMany).mockResolvedValue([{id:'child',name:'Amy Student',studentCode:'STU-1',routeId:'route-a',busId:'bus-a',pickupStopId:'stop-a',dropoffStopId:'stop-b'}])
  mock(prisma.attendance.createMany).mockResolvedValue({count:1})
  const response=await upload('Absent')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({created:1,archived:0,skipped:0})
  expect(prisma.attendance.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({tripId:'trip-1',studentId:'child',action:'ABSENT'})],skipDuplicates:true})
  expect(prisma.attendanceImportRecord.createMany).not.toHaveBeenCalled()
})

test('re-import is idempotent and archives Not marked instead of pretending the crew confirmed attendance',async()=>{
  mock(prisma.attendanceImportRecord.createMany).mockResolvedValue({count:0})
  const response=await upload('Not marked')
  expect(await response.json()).toMatchObject({archived:0,skipped:0,duplicates:1})
  expect(prisma.attendanceImportRecord.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({status:'NOT_MARKED'})],skipDuplicates:true})
})

test('bundled historical Excel template imports without fabricating a trip',async()=>{
  mock(prisma.attendanceImportRecord.createMany).mockResolvedValue({count:3})
  const fileName='attendance-period.xlsx'
  const form=new FormData()
  form.set('file',new File([readFileSync(join(process.cwd(),'public','templates',fileName))],fileName))
  const response=await POST(new NextRequest('http://localhost/api/attendance/import',{method:'POST',body:form}))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({created:0,archived:3,skipped:0})
  expect(prisma.attendance.createMany).not.toHaveBeenCalled()
})

test('tenant scope cannot be chosen by another school admin',async()=>{
  const form=new FormData()
  form.set('organizationId','school-b')
  form.set('file',new File(['Date,Status\n15/09/2026,Absent'],'attendance.csv'))
  const response=await POST(new NextRequest('http://localhost/api/attendance/import',{method:'POST',body:form}))
  expect(response.status).toBe(403)
  expect(prisma.attendanceImportRecord.createMany).not.toHaveBeenCalled()
})

test('missing production archive migration returns a clear action before writing any trip records',async()=>{
  mock(prisma.attendanceImportRecord.count).mockRejectedValue({code:'P2021',meta:{modelName:'AttendanceImportRecord',table:'public.AttendanceImportRecord'}})
  mock(prisma.trip.findMany).mockResolvedValue([{id:'trip-1',date:new Date('2026-09-15T00:00:00+08:00'),serviceType:'PM',routeId:'route-a',busId:'bus-a',route:{name:'Route A'},bus:{busNumber:'BUS-001',plateNumber:'BUS-001'}}])
  mock(prisma.student.findMany).mockResolvedValue([{id:'child',name:'Amy Student',studentCode:'STU-1',routeId:'route-a',busId:'bus-a',pickupStopId:'stop-a',dropoffStopId:'stop-b'}])
  const form=new FormData()
  form.set('file',new File(['Date,Session,Route,Bus,Student,Student ID,Status\n15/09/2026,AFTERNOON,Route A,BUS-001,Amy Student,STU-1,Absent\n15/09/2026,AFTERNOON,Old route,Old bus,Other Student,STU-2,Absent'],'mixed-attendance.csv'))
  const response=await POST(new NextRequest('http://localhost/api/attendance/import',{method:'POST',body:form}))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({code:'MIGRATION_REQUIRED',error:expect.stringContaining('migrate deploy')})
  expect(prisma.attendance.createMany).not.toHaveBeenCalled()
  expect(prisma.attendanceImportRecord.createMany).not.toHaveBeenCalled()
})

import test from 'node:test';
import assert from 'node:assert/strict';
import runtime from '../platform/api/dist/modules/course-runtime/course-runtime.service.js';
import grading from '../platform/api/dist/modules/course-runtime/restoration-assessment.js';
import {gradeQuiz,QUIZ_QUESTIONS} from '../coursewares/qiong-ai-restoration-challenge/shared/learning-quiz.mjs';
const {CourseRuntimeService}=runtime;

function fixture() {
  const proposalId='owned-proposal';
  const artifacts=['final-work','evidence-package','restoration-result','restoration-plan','restoration-clue'].map((kind,i)=>({
    id:'file'+i,kind,metadata:{proposalId},publicUrl:'https://platform.invalid/file/'+i,
  }));
  const record={id:'record',status:'STARTED',artifacts};
  let writes=0;
  const fake={
    findPublishedCourseware:async()=>({id:'ware',slug:'courseware-is9nlxd12',course:{id:'course',slug:'qiong-ai-inquiry'}}),
    ensureAssignmentCoursewareOpen:async()=>{},ensureStudentInClass:async()=>{},includeRelations:()=>({}),toRecord:v=>v,
    prisma:{
      courseAssignment:{findFirst:async()=>({id:'assignment',courseId:'course',classId:'class',status:'ACTIVE',teachingStatus:'OPEN'})},
      learningRecord:{
        findFirst:async()=>record,
        update:async({data})=>{writes++;Object.assign(record,data);},
        findUniqueOrThrow:async()=>record,
      },
      learningRecordArtifact:{findMany:async({where})=>{
        assert.equal(where.studentId,'student');assert.equal(where.assignmentId,'assignment');return artifacts;
      }},
    },
  };
  const input={assignmentId:'assignment',status:'COMPLETED',score:100,summary:{
    proposalId,restorationAssessment:gradeQuiz(['A','B','C','D','B'],proposalId),
    artifacts:artifacts.map(a=>({kind:a.kind,url:a.publicUrl})),
  }};
  return {fake,input,record,artifacts,writes:()=>writes};
}
test('platform recomputes grades, refuses missing answers and mismatched work artifacts',async()=>{
  for(const assessment of [undefined,{version:'bad',selections:['A','B','C','D','A']}]) {
    const f=fixture();f.input.summary.restorationAssessment=assessment;
    await assert.rejects(CourseRuntimeService.prototype.upsertStudentRecord.call(f.fake,'student',f.input),/5 道单选题/);
    assert.equal(f.writes(),0);
  }
  const mixed=fixture();mixed.artifacts[0].metadata.proposalId='another';
  await assert.rejects(CourseRuntimeService.prototype.upsertStudentRecord.call(mixed.fake,'student',mixed.input),/附件尚未保存完整/);
  assert.equal(mixed.writes(),0);
  const f=fixture();f.input.summary.restorationAssessment.totalScore=1000;
  const result=await CourseRuntimeService.prototype.upsertStudentRecord.call(f.fake,'student',f.input);
  assert.equal(result.score,90);assert.equal(result.summary.answers.length,5);
  assert.equal(result.summary.restorationAssessment.workPoints,50);
  assert.equal(result.summary.restorationAssessment.quizPoints,40);
});
test('platform and courseware share the same question definition and all scoring outcomes',()=>{
  const correct=QUIZ_QUESTIONS.map(q=>q.correctOption);
  for(let n=0;n<=5;n++){
    const selections=correct.map((v,i)=>i<n?v:v==='A'?'B':'A'),grade=gradeQuiz(selections,'proposal');
    assert.deepEqual(grading.gradeRestorationAssessment(grade,'proposal'),grade);
  }
});

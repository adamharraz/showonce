from typing import Literal
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, model_validator

def uid() -> str:
    return uuid4().hex

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')

class Question(Strict):
    id: str = Field(default_factory=uid)
    text: str = Field(min_length=1, max_length=1000)
    required: bool = True
    answer: str = Field(default='', max_length=3000)

class Criterion(Strict):
    id: str = Field(default_factory=uid)
    description: str = Field(min_length=1, max_length=1000)
    mode: Literal['visual', 'manual'] = 'manual'

class Step(Strict):
    id: str = Field(default_factory=uid)
    title: str = Field(min_length=1, max_length=200)
    instruction: str = Field(min_length=1, max_length=4000)
    expected_outcome: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[str] = Field(default_factory=list, max_length=8)
    timestamp_ms: int = Field(default=0, ge=0)
    provenance: Literal['visible', 'narrated', 'instructor-confirmed'] = 'visible'
    criteria: list[Criterion] = Field(default_factory=list, max_length=8)
    questions: list[Question] = Field(default_factory=list, max_length=8)

class LessonDraft(Strict):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default='', max_length=4000)
    materials: list[str] = Field(default_factory=list, max_length=30)
    steps: list[Step] = Field(default_factory=list, max_length=30)
    questions: list[Question] = Field(default_factory=list, max_length=15)

    @model_validator(mode='after')
    def unique_ids(self):
        values = [s.id for s in self.steps] + [c.id for s in self.steps for c in s.criteria]
        if len(values) != len(set(values)):
            raise ValueError('Step and criterion IDs must be unique')
        return self

class Observation(Strict):
    id: str = Field(default_factory=uid)
    action: str = Field(min_length=1, max_length=3000)
    expected_outcome: str = Field(default='', max_length=2000)
    evidence_ids: list[str] = Field(default_factory=list, max_length=8)
    timestamp_ms: int = Field(default=0, ge=0)
    provenance: Literal['visible', 'narrated'] = 'visible'
    materials: list[str] = Field(default_factory=list, max_length=15)
    uncertainties: list[str] = Field(default_factory=list, max_length=10)
    replaces_observation_id: str | None = None

class ObservationBatch(Strict):
    task_title: str = Field(default='', max_length=200)
    observations: list[Observation] = Field(default_factory=list, max_length=12)

class CriterionResult(Strict):
    criterion_id: str
    supported: bool
    evidence_ids: list[str] = Field(default_factory=list, max_length=4)
    explanation: str = Field(max_length=1000)

class AssessmentOutput(Strict):
    outcome: Literal['met', 'correction', 'clearer_view', 'unavailable']
    explanation: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[str] = Field(default_factory=list, max_length=8)
    criteria: list[CriterionResult] = Field(default_factory=list, max_length=8)

class CreateSession(Strict):
    mode: Literal['teach', 'practice']
    source: Literal['camera', 'screen', 'phone']
    lesson_id: str | None = None
    version: int | None = Field(default=None, ge=1)

class DraftEdit(Strict):
    revision: int = Field(ge=0)
    draft: LessonDraft

class SetStep(Strict):
    step_id: str

class FrameMessage(Strict):
    type: Literal['frame']
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    timestamp_ms: int = Field(ge=0, le=900000)
    data: str = Field(max_length=1400000)

class AudioMessage(Strict):
    type: Literal['audio']
    timestamp_ms: int = Field(ge=0, le=900000)
    data: str = Field(max_length=90000)

class SessionError(Strict):
    code: str
    message: str

class CaptureGap(Strict):
    timestamp_ms: int
    reason: str

class SessionRecord(Strict):
    id: str
    owner_id: str
    mode: Literal['teach', 'practice']
    source: Literal['camera', 'screen', 'phone']
    state: Literal['capturing', 'paused', 'quota_paused', 'interrupted', 'finished']
    title: str
    model: str
    created_at: str
    finished_at: str | None = None
    last_analysis_at: str | None = None
    last_error: SessionError | None = None
    lesson_id: str
    version_id: str | None = None
    step_id: str | None = None
    step_revision: int = 0
    gaps: list[CaptureGap] = Field(default_factory=list)
    published: bool = False
    quota_date: str | None = None

class AssessmentRecord(AssessmentOutput):
    id: str
    owner_id: str
    session_id: str
    version_id: str
    step_id: str
    step_revision: int = 0
    latency_ms: int
    created_at: str
    manual_unverified: list[str] = Field(default_factory=list)

class JobRecord(Strict):
    id: str
    owner_id: str
    session_id: str
    state: Literal['queued', 'running', 'complete', 'failed', 'interrupted']
    attempts: int
    error: str | None = None
    lesson_id: str | None = None

class LessonRecord(Strict):
    id: str
    owner_id: str
    session_id: str
    revision: int
    latest_version: int
    draft: LessonDraft
    created_at: str

class VersionRecord(Strict):
    id: str
    owner_id: str
    lesson_id: str
    version: int
    draft: LessonDraft
    published_at: str

class ObservationRecord(Observation):
    owner_id: str
    session_id: str

class SessionDetail(Strict):
    session: SessionRecord
    observations: list[ObservationRecord]
    assessments: list[AssessmentRecord]
    job: JobRecord | None

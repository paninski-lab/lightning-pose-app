import reactivex
import reactivex.subject
from apscheduler import events as e
from apscheduler.schedulers.base import BaseScheduler
from fastapi import FastAPI


def setup_active_task_registry(app: FastAPI):
    # Get APScheduler instance
    scheduler: BaseScheduler = app.state.scheduler

    subject = reactivex.subject.BehaviorSubject(0)

    app.state.num_active_transcode_tasks = subject

    _num_active_jobs = 0

    def my_listener(event):
        nonlocal _num_active_jobs
        if event.code == e.EVENT_JOB_SUBMITTED:
            _num_active_jobs += 1
        else:
            _num_active_jobs -= 1

        subject.on_next(_num_active_jobs)

    scheduler.add_listener(
        my_listener,
        e.EVENT_JOB_SUBMITTED
        | e.EVENT_JOB_EXECUTED
        | e.EVENT_JOB_ERROR
        | e.EVENT_JOB_MISSED,
    )

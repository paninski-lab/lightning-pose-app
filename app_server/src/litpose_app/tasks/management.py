import reactivex
import reactivex.subject
from apscheduler import events as e
from apscheduler.schedulers.base import BaseScheduler
from fastapi import FastAPI


def setup_active_task_registry(app: FastAPI):
    # Get APScheduler instance
    scheduler: BaseScheduler = app.state.scheduler

    subject = reactivex.subject.BehaviorSubject(len(scheduler.get_jobs()))

    app.state.num_active_transcode_tasks = subject

    def my_listener(event):
        jobs = scheduler.get_jobs()
        subject.on_next(len(jobs))

    scheduler.add_listener(my_listener, e.EVENT_JOB_ADDED | e.EVENT_JOB_REMOVED)

from flask import Flask, jsonify
from lightning_pose.data.datatypes import ProjectConfig

app = Flask(__name__)


@app.post('/getProjectInfo')
@Response(model=ProjectConfig)
def getProjectInfo():
    project_config = ProjectConfig(
        data_dir='/home/ksikka/fly-anipose',
        models_dir='/home/ksikka/fly-anipose/models'
    )
    return project_config

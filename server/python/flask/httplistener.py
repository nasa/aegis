# This file listens for python script commands over http POST and returns results via http GET.
# The flask server is initialized with the command: /usr/local/bin/flask --app flask/httplistener.py run --host=0.0.0.0 -p 80
# This command is in the entrypoint.sh file in the docker/gdal directory.
#
# Uses Flask registering Shell2HTTP commands.
# The endpoint is /commands/<command_name> and the arguments are passed as a JSON body in the format:
# { "args": ["arg1", "arg2", "arg3"]} }
# Example:
# curl -X POST -H 'Content-Type: application/json' -d '{"args": ["--raster", "/static/missionFiles/1/Data/NAC_DTM_APOLLO14.TIF", "--axes", "z", "--band", "1", "--path", "_3.645421873728663,-17.47186660766602|-3.654850309034696,-17.46714591979981|-3.6449998008920375,-17.46010780334473|-3.6305197977566683,-17.43161201477051", "--steps", "32|37|97"]}' http://127.0.0.1:4200/commands/pathToElevationProfile

from flask import Flask
from flask_executor import Executor
from flask_shell2http import Shell2HTTP
from waitress import serve

# Flask application instance
app = Flask(__name__)

executor = Executor(app)
shell2http = Shell2HTTP(app=app, executor=executor, base_url_prefix="/commands/")

def my_callback_fn(context, future):
  print(context, future.result())

shell2http.register_command(endpoint="pathToElevationProfile", command_name="python /app/pathToElevationProfile.py", callback_fn=my_callback_fn, decorators=[])

if __name__ == "__main__":
  serve(app, host="0.0.0.0", port=80)
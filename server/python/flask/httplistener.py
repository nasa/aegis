# This file listens for python script commands over http POST and returns results via http GET.
# The flask server is initialized with the command: /usr/local/bin/flask --app flask/httplistener.py run --host=0.0.0.0 -p 80
# This command is in the entrypoint.sh file in the docker/gdal directory.
#
# Uses Flask registering Shell2HTTP commands.
# The endpoint is /commands/<command_name> and the arguments are passed as a JSON body in the format:
# { "args": ["arg1", "arg2", "arg3"]} }
# Example:
# curl -X POST -H 'Content-Type: application/json' -d '{"args": ["/static/1/arizona_dem_10m_3857.tif", "35.5816285", "-111.64001942", "35.58291988", "-111.62139416", "10", "z", "1"]}' http://localhost:4200/commands/2ptsToProfile

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
## Development

### UI Development required tools 

To compile the app (only necessary for UI development) you will need to install Node.js and angular devtools.

```bash
# Install nvm (node version manager), the recommended way to install node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Reload the shell to initialize `nvm` related environment variables.  
Then:

```bash
nvm install node
npm install -g @angular/cli

# Install project dependencies from web_ui/package.json.
# Outputs a node_modules folder which is gitignored.
cd web_ui && npm install
```

### Running the dev servers

You need to run two servers: the backend server, and an angular dev server. If you only want to run one or the other,
use the relevant command inside `Procfile.dev`. If you're only starting the backend server (not doing any UI development),
you can directly use the uvicorn command inside Procfile.dev instead of honcho.

```bash
# Installs a tool that's useful for running multiple servers at once
pip install honcho

# Runs services defined in the Procfile.dev 
honcho -f Procfile.dev start
```

The angular dev server `ng serve` is the primary endpoint which forwards some requests to uvicorn (see [proxy.conf.json](web_ui/src/proxy.conf.json)).
This is a dev-only setup: in production, static assets including the compiled angular app are served by `uvicorn`.

The use of angular's dev server is for hot module reloading, meaning when you change an angular source file, the UI automatically updates without even a page reload.
Uvicorn is also run with reload=True, so when you change a python file, the uvicorn server reloads.

### Building and running a production release

With the development setup above (no need for honcho), run
```bash
sh build.sh
```

This calls `ng build` to compile the app as static files, and puts them inside the `app_server` directory. Specifically, `app_server/src/litpose_app/ngdist`. It's gitignored so you won't check it in by accident.

The python server is configured to serve the app out of that directory. You can run the app normally:
```bash
litpose app
```

And when you build a release of `litpose_app`, the package will include the compiled angular app files,
as this is the default behavior of the build backend.


```bash
# If needed:
pip install build

cd app_server
python -m build .
# Outputs dist/*.whl. Distributions contain the compiled angular app from build.sh.
```
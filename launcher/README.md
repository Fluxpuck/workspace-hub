# workspace-hub-docker

A tiny npm launcher for the [workspace-hub](https://github.com/Fluxpuck/workspace-hub) MCP server. Pulls the prebuilt Docker image from GHCR and manages the container lifecycle with simple commands.

## Requirements

- [Node.js](https://nodejs.org/) ≥ 18
- [Docker](https://docs.docker.com/get-docker/) installed and running

## Install

```bash
npm install -g workspace-hub-docker
```

Or run without installing:

```bash
npx workspace-hub-docker up
```

## Commands

| Command | Description |
|---------|-------------|
| `workspace-hub-docker up` | Pull the latest image and start the container |
| `workspace-hub-docker down` | Stop and remove the container |
| `workspace-hub-docker logs` | Tail container logs |
| `workspace-hub-docker status` | Show container status |

## Options (environment variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4440` | Port the server listens on inside the container |
| `HOST_PORT` | same as `PORT` | Host port exposed to your machine |

Example using a custom host port:

```bash
HOST_PORT=9000 workspace-hub-docker up
```

## Persistence

State is automatically persisted in a named Docker volume called `workspace-hub-data` (mounted at `/app/data` inside the container). Data survives container restarts and `down`/`up` cycles.

## Connect your MCP client

After running `workspace-hub-docker up`, configure each IDE workspace:

```json
{
  "mcpServers": {
    "workspace-hub": {
      "serverUrl": "http://localhost:4440/mcp"
    }
  }
}
```

## Publishing to npm

```bash
cd launcher
npm publish --access public
```

To automate releases, add an npm token to GitHub Secrets as `NPM_TOKEN` and extend the publish workflow.

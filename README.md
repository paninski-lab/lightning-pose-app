![](docs/images/lpa.png)

![PyPI](https://img.shields.io/pypi/v/lightning-pose-app)
![GitHub](https://img.shields.io/github/license/paninski-lab/lightning-pose-app)
[![Documentation Status](https://readthedocs.org/projects/lightning-pose/badge/?version=latest)](https://lightning-pose.readthedocs.io/en/latest/?badge=latest)
[![Discord](https://img.shields.io/discord/1103381776895856720)](https://discord.gg/tDUPdRj4BM)

Web UI for [Lightning Pose](https://github.com/paninski-lab/lightning-pose): labeling, training, inference, and reviewing pose predictions.

This is a separate repo from core lightning-pose. You should not have to clone it unless you are changing app source code. Most users install from PyPI:

## Install using `pip`

```bash
pip install lightning-pose lightning-pose-app
litpose run_app
```

Then open the host/port printed in the terminal, e.g. `http://localhost:4200`.

Requires Linux or WSL, NVIDIA GPU with CUDA 12+, Python 3.10–3.12.

## Documentation

Full installation guides, tutorials, and API docs:

👉 **[https://lightning-pose.readthedocs.io/](https://lightning-pose.readthedocs.io/)**

## Community

Questions, troubleshooting, and feedback: join the Lightning Pose [Discord](https://discord.gg/tDUPdRj4BM).

Bug reports with a clear repro can also go in [GitHub Issues](https://github.com/paninski-lab/lightning-pose-app/issues). Feature discussion is often easier on Discord first.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Latest: **[2.4.2.0](CHANGELOG.md#2420--2026-09-21)**.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, lint, and pull requests.

(Maintainers: [DEV.md](DEV.md) for GitHub/PyPI releases, etc.)

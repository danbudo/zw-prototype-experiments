# Zero Width prototype experiments

Independent, disposable sound laboratories for exploring Zero Width instruments. Each experiment lives in its own directory and owns its implementation and documentation.

## CLLDR

[CLLDR](clldr/README.md) is a standalone browser instrument built around two interacting oscillators: ideal multiplication, polarity switching and sign-bit XOR. It includes independent pitch sweeps, mutual FM, hard sync, bounded feedback, circuit imperfections, envelopes, live analysis, experimental pitch lock, A/B snapshots and six test configurations.

No dependency installation or build is needed. From the repository root:

```sh
npm start
```

This serves CLLDR on port 8000. Open through localhost or an HTTPS development forwarding URL, click **Enable audio**, then **Strike**. AudioWorklet requires a modern browser and a secure context. Start at a low listening volume.

```sh
npm test
```

Runs the dependency-free DSP tests with Node 20+. See [CLLDR's documentation](clldr/README.md) for controls, DSP design, validation and limitations.

This repository contains experiments, not the final Zero Width application or shared DSP architecture.

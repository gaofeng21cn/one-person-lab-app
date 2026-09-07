# v26.6.18 Release Timing Provenance

This historical timing study compared first attempt `27732095094`, successful
release `27740551584` and promote `27741971528` for App
`829e67b971c73e28bc5c81eaeca30617b4f0b458`. The measured remote span was
4h54m36s; the reported full operator loop was 5h45m51s. The difference was not
attributed to individual local phases without supporting evidence.

Failed or cancelled runs consumed 2h47m9s of accumulated workflow wall time.
Other costs included broad Shell checkout, repeated artifact transfers and
building the same Docker image twice. Shallow checkout, artifact reuse and
single-build qualification addressed those costs without removing first-run
acceptance.

The old candidate/promote run list and optimization queue are retired. Current
release choreography belongs to the [release guide](../../delivery/release/README.md).
Fresh profiling uses `npm run release:actions-timing`; this record's timings do
not establish current performance or release state.

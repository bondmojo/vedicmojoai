# scripts/oracle/Dockerfile — task 9.1 of .kiro/specs/marriage-matchmaking/tasks.md
#
# A dev-only, throwaway image that runs PyJHora (AGPL-3.0) locally to generate
# an oracle sample for the Ashtakoota koota tables. This image is DELIBERATELY
# ISOLATED from the app's own Dockerfile/docker-compose.yml:
#
#   - It is never referenced by docker-compose.yml (the deployed stack) or by
#     the app's own Dockerfile.
#   - PyJHora is pip-installed here, in this container, and NOWHERE else —
#     it is never added to package.json, never imported from engine/ or mcp/,
#     never vendored/copied into this repository.
#   - Its generated output lands in ./scripts/oracle/output/, which is
#     git-ignored — nothing PyJHora produces is committed as-is. Per task 9.2
#     / Open Decision 13, only a HAND-CURATED, DOCUMENTED sample derived from
#     that output may be transcribed into a committed test fixture.
#
# Why the isolation matters: PyJHora is AGPL-3.0. Shipping it inside the
# deployed app image (the one docker-compose.yml's `app` service builds and
# serves to users over the network) would make this application a distributed
# derivative of AGPL code and could trigger AGPL's network-copyleft
# source-release obligation for this entire repository. Running it only in a
# separate, non-deployed, gitignored-output container avoids that entirely.
#
# Build:
#   docker compose -f docker-compose.oracle.yml build
# Run:
#   docker compose -f docker-compose.oracle.yml run --rm oracle
# (see scripts/oracle/README.md for flags and what to do with the output)

FROM python:3.11-slim

# pyswisseph ships no pre-built wheel for every platform (notably arm64) and
# falls back to compiling its C extension from source — needs a compiler.
RUN apt-get update && apt-get install -y --no-install-recommends gcc build-essential \
    && rm -rf /var/lib/apt/lists/*

# PyJHora's own PyPI metadata under-declares its dependencies (importing
# jhora.horoscope.match.compatibility alone pulls in numpy, pytz, etc. at
# package-init time even though only Ashtakoota's integer-only API is used
# here) — installed from PyJHora's own requirements.txt, minus the desktop
# GUI stack (PyQt6/pyqtgraph), which is never imported by the compatibility
# module and would need extra system libraries in this slim, headless image.
RUN pip install --no-cache-dir \
    PyJHora \
    pyswisseph==2.10.3.2 \
    numpy==2.1.1 \
    pytz==2024.1 \
    Requests==2.32.3 \
    geocoder==1.38.1 \
    geopy==2.4.1 \
    img2pdf==0.5.1 \
    timezonefinder==6.5.2 \
    python-dateutil

WORKDIR /oracle
COPY generate_oracle.py .

ENTRYPOINT ["python", "generate_oracle.py"]
CMD ["--full"]

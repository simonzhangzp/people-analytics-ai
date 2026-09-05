# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.
#
# Fork overlay: People Analytics AI builds Microsoft Data Formulator 0.8
# and injects the People knowledge layer at startup.

ARG DF_COMMIT=5477f0e236426dc8f74a498ec400414fba7fbc0f

FROM node:20-slim AS frontend-builder
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG DF_COMMIT
RUN git clone https://github.com/microsoft/data-formulator.git . \
    && git checkout "${DF_COMMIT}"
RUN yarn install --frozen-lockfile
RUN yarn build

FROM python:3.11-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev unixodbc-dev curl git \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash appuser
ENV LANG=C.UTF-8
ENV PYTHONUNBUFFERED=1
ENV DATA_FORMULATOR_HOME=/home/appuser/.data_formulator
WORKDIR /app
ARG DF_COMMIT
RUN git clone https://github.com/microsoft/data-formulator.git . \
    && git checkout "${DF_COMMIT}"
COPY --from=frontend-builder /app/py-src/data_formulator/dist ./py-src/data_formulator/dist
RUN pip install --no-cache-dir .
COPY people_layer /opt/formulator/people_layer
COPY entrypoint.py /opt/formulator/entrypoint.py
RUN mkdir -p "${DATA_FORMULATOR_HOME}" \
    && chown -R appuser:appuser /app /opt/formulator "${DATA_FORMULATOR_HOME}"
USER appuser
EXPOSE 5567
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:5567/ || exit 1
ENTRYPOINT ["python", "/opt/formulator/entrypoint.py", "--host", "0.0.0.0", "--port", "5567"]

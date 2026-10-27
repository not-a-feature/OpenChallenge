FROM python:3.14-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /uvx /bin/
WORKDIR /app/worker
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev && useradd --uid 10001 --create-home portal
COPY comparator.py worker.py ./
ENV PATH="/app/worker/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER portal
CMD ["python", "worker.py"]

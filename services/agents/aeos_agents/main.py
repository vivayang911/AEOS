from datetime import UTC, datetime
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="AEOS Agent Service", version="0.1.0")

class DecisionRequest(BaseModel):
    organization_id: str = Field(min_length=1)
    objective: str = Field(min_length=3, max_length=2000)
    evidence_ids: list[str] = Field(min_length=1)

@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "agents", "status": "ok", "version": "0.1.0", "timestamp": datetime.now(UTC).isoformat()}

@app.post("/v1/decisions", status_code=202)
def create_decision(request: DecisionRequest) -> dict[str, object]:
    return {"status": "not_configured", "objective": request.objective, "evidence_ids": request.evidence_ids, "message": "Agent providers are not configured; no recommendation was generated."}


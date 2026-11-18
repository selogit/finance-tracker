from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.transactions import router as finance_router

app = FastAPI(
    title="Personal Finance Analyzer API",
    version="0.1.0",
    description="API do importu wyciągów bankowych CSV, automatycznej kategoryzacji i analizy wydatków.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(finance_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
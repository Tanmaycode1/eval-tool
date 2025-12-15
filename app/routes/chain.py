"""Prompt chain page routes"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/prompt-chain/{trace_id}", response_class=HTMLResponse)
async def chain_page(request: Request, trace_id: str):
    """Prompt chain detail page"""
    return templates.TemplateResponse(
        "prompt-chain.html",
        {"request": request, "trace_id": trace_id, "title": "Shram.ai - Prompt Chain"}
    )


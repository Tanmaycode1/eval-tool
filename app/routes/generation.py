"""Generation page routes"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/generation/{event_id}", response_class=HTMLResponse)
async def generation_page(request: Request, event_id: str):
    """Single generation detail page"""
    return templates.TemplateResponse(
        "generation.html",
        {"request": request, "event_id": event_id, "title": "Shram.ai - Generation"}
    )


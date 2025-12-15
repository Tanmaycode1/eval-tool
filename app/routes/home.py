"""Home page routes"""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Home page - list of events and chains"""
    return templates.TemplateResponse(
        "home.html",
        {"request": request, "title": "Shram.ai"}
    )


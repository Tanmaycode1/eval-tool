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


@router.get("/input/{input_id}", response_class=HTMLResponse)
async def input_redirect(request: Request, input_id: str):
    """
    Universal input redirect endpoint - accepts event IDs or trace IDs
    and redirects to the appropriate page after processing
    """
    return templates.TemplateResponse(
        "input_redirect.html",
        {"request": request, "input_id": input_id}
    )


from fastapi import APIRouter
from portfolio.service import generate_mock_prices, calculate_efficient_frontier

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/frontier")
def get_frontier():
    prices = generate_mock_prices()
    return calculate_efficient_frontier(prices)

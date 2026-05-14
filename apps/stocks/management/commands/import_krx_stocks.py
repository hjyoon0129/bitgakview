import re
import time

import requests
from bs4 import BeautifulSoup
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.stocks.models import StockSymbol


class Command(BaseCommand):
    help = "Import Korean stock symbols from Naver Finance quickly"

    NAVER_MARKETS = {
        "KOSPI": 0,
        "KOSDAQ": 1,
    }

    def add_arguments(self, parser):
        parser.add_argument(
            "--market",
            type=str,
            default="ALL",
            help="가져올 시장: ALL, KOSPI, KOSDAQ",
        )

    def get_session(self):
        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Referer": "https://finance.naver.com/",
            }
        )
        return session

    def fetch_soup(self, session, sosok, page):
        url = "https://finance.naver.com/sise/sise_market_sum.naver"

        response = session.get(
            url,
            params={
                "sosok": sosok,
                "page": page,
            },
            timeout=15,
        )

        response.raise_for_status()
        response.encoding = "euc-kr"

        return BeautifulSoup(response.text, "html.parser")

    def get_last_page(self, session, sosok):
        soup = self.fetch_soup(session, sosok=sosok, page=1)

        last_page = 1

        last_link = soup.select_one("td.pgRR a")
        if last_link and last_link.get("href"):
            match = re.search(r"page=(\d+)", last_link.get("href"))
            if match:
                return int(match.group(1))

        for link in soup.select("td.pg a, td.pgRR a"):
            href = link.get("href", "")
            match = re.search(r"page=(\d+)", href)
            if match:
                last_page = max(last_page, int(match.group(1)))

        return last_page

    def parse_stock_rows(self, soup, market_name):
        rows = []

        for link in soup.select("a.tltle"):
            href = link.get("href", "")
            name = link.get_text(strip=True)

            match = re.search(r"code=(\d{6})", href)
            if not match:
                continue

            code = match.group(1)

            if not code or not name:
                continue

            rows.append(
                {
                    "code": code,
                    "name": name,
                    "market": market_name,
                }
            )

        return rows

    def collect_market_rows(self, session, market_name, sosok):
        self.stdout.write("")
        self.stdout.write(f"{market_name} 종목 가져오는 중...")

        try:
            last_page = self.get_last_page(session, sosok)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"{market_name} 마지막 페이지 확인 실패: {e}"))
            return []

        self.stdout.write(f"{market_name} 총 페이지: {last_page}")

        market_rows = []

        for page in range(1, last_page + 1):
            try:
                soup = self.fetch_soup(session, sosok=sosok, page=page)
                rows = self.parse_stock_rows(soup, market_name)

                market_rows.extend(rows)

                self.stdout.write(f"{market_name} page {page}/{last_page} 완료")

                time.sleep(0.05)

            except Exception as e:
                self.stdout.write(
                    self.style.WARNING(f"{market_name} page {page} 실패: {e}")
                )
                continue

        self.stdout.write(
            self.style.SUCCESS(f"{market_name} 수집 완료: {len(market_rows)}개")
        )

        return market_rows

    def save_rows_bulk(self, rows):
        if not rows:
            return 0, 0, 0

        # 코드 기준 중복 제거
        unique_rows = {}

        for row in rows:
            unique_rows[row["code"]] = row

        codes = list(unique_rows.keys())

        existing_stocks = StockSymbol.objects.filter(code__in=codes).order_by("id")

        existing_by_code = {}

        for stock in existing_stocks:
            if stock.code not in existing_by_code:
                existing_by_code[stock.code] = stock

        to_create = []
        to_update = []

        for code, row in unique_rows.items():
            existing = existing_by_code.get(code)

            if existing:
                changed = False

                if existing.name != row["name"]:
                    existing.name = row["name"]
                    changed = True

                if existing.market != row["market"]:
                    existing.market = row["market"]
                    changed = True

                if changed:
                    to_update.append(existing)

            else:
                to_create.append(
                    StockSymbol(
                        code=row["code"],
                        name=row["name"],
                        market=row["market"],
                    )
                )

        with transaction.atomic():
            if to_create:
                StockSymbol.objects.bulk_create(
                    to_create,
                    batch_size=500,
                )

            if to_update:
                StockSymbol.objects.bulk_update(
                    to_update,
                    ["name", "market"],
                    batch_size=500,
                )

        total_count = len(unique_rows)
        created_count = len(to_create)
        updated_count = len(to_update)

        return total_count, created_count, updated_count

    def handle(self, *args, **options):
        selected_market = options.get("market", "ALL").upper().strip()

        if selected_market != "ALL" and selected_market not in self.NAVER_MARKETS:
            self.stdout.write(
                self.style.ERROR("market 값은 ALL, KOSPI, KOSDAQ 중 하나여야 합니다.")
            )
            return

        session = self.get_session()

        if selected_market == "ALL":
            markets = self.NAVER_MARKETS.items()
        else:
            markets = [(selected_market, self.NAVER_MARKETS[selected_market])]

        all_rows = []

        for market_name, sosok in markets:
            rows = self.collect_market_rows(
                session=session,
                market_name=market_name,
                sosok=sosok,
            )
            all_rows.extend(rows)

        self.stdout.write("")
        self.stdout.write("DB 저장 중...")

        total, created, updated = self.save_rows_bulk(all_rows)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("종목 가져오기 완료"))
        self.stdout.write(f"총 처리: {total}개")
        self.stdout.write(f"신규 생성: {created}개")
        self.stdout.write(f"업데이트: {updated}개")
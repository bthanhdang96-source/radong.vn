# Source Research - World Coffee Benchmark

## Selected Sources

- ICO Public Market Information: selected as the primary daily coffee indicator source. The pipeline uses the public Robustas indicator in US cents/lb and converts it to USD/ton. Sources: https://ico.org/resources/public-market-information/ and https://www.ico.org/documents/I-CIP.pdf
- World Bank Pink Sheet: selected as the monthly official backup and historical backfill. The pipeline uses Coffee, Robusta and Coffee, Arabica series in USD/kg and converts them to USD/ton. Source: https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/world-bank-commodities-price-data-the-pink-sheet
- ICE Robusta Coffee Futures: recorded as the official London Robusta futures reference. ICE contract code RC is quoted in USD per metric tonne, but this MVP does not scrape or store ICE prices without a licensed data feed. Source: https://www.ice.com/products/37089079

## Rejected Or Deferred Sources

- Yahoo Finance, Barchart, Investing.com, and similar charting sites are not used because public reuse and automated extraction rights are unclear.
- Nasdaq Data Link or other licensed futures APIs are deferred until an API key, dataset symbol, and license scope are available.

## Licensing Warning

- This dataset is suitable for internal MVP analytics with source attribution and licensing review notes.
- Do not redistribute futures/indicator data commercially or present it as a real-time trading feed without reviewing source licenses.

from flask import Flask, jsonify, send_from_directory, request
import requests
import os
import time

app = Flask(__name__, static_folder="static")

def to_cents(val):
    if val is None:
        return 0.0
    try:
        f_val = float(val)
        if f_val <= 1.0:
            return f_val * 100
        return f_val
    except ValueError:
        return 0.0

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/static/<path:path>")
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route("/api/markets")
def get_markets():
    event_ticker = request.args.get("ticker", "KXWCGAME-26JUN22ARGAUT")
    try:
        url = "https://external-api.kalshi.com/trade-api/v2/markets"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        res = requests.get(url, params={"event_ticker": event_ticker, "status": "open"}, headers=headers)
        res.raise_for_status()
        
        markets = res.json().get("markets", [])
        
        if "GAME-" in event_ticker:
            order_map = {"ARG": 0, "TIE": 1, "AUT": 2}
            sorted_markets = sorted(markets, key=lambda m: order_map.get(m.get("ticker", "").split("-")[-1], 9))
        else:
            sorted_markets = sorted(markets, key=lambda m: float(m.get("volume_fp", "0.0")), reverse=True)
            
        formatted = []
        for m in sorted_markets:
            formatted.append({
                "ticker": m.get("ticker"),
                "title": m.get("title"),
                "subtitle": m.get("subtitle", ""),
                "volume": float(m.get("volume_fp", "0.0")),
                "open_interest": float(m.get("open_interest_fp", "0.0")),
                "yes_bid": to_cents(m.get("yes_bid_dollars")),
                "yes_ask": to_cents(m.get("yes_ask_dollars")),
                "no_bid": to_cents(m.get("no_bid_dollars")),
                "no_ask": to_cents(m.get("no_ask_dollars")),
                "last_price": to_cents(m.get("last_price_dollars")),
                "open_time": m.get("open_time", "")
            })
            
        return jsonify(formatted)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

history_cache = {}

@app.route("/api/history")
def get_history():
    now = int(time.time())
    default_tickers = "KXWCGAME-26JUN22ARGAUT-ARG,KXWCGAME-26JUN22ARGAUT-TIE,KXWCGAME-26JUN22ARGAUT-AUT"
    market_tickers = request.args.get("market_tickers", default_tickers)
    
    start_ts = request.args.get("start_ts", type=int)
    if not start_ts:
        start_ts = now - 86400 * 30
        
    cache_key = f"{market_tickers}:{start_ts}"
    if cache_key in history_cache:
        cached_data, cached_time = history_cache[cache_key]
        if now - cached_time < 3600:
            return jsonify(cached_data)
            
    try:
        url = "https://external-api.kalshi.com/trade-api/v2/markets/candlesticks"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        params = {
            "market_tickers": market_tickers,
            "start_ts": start_ts,
            "end_ts": now,
            "period_interval": 1440
        }
        res = requests.get(url, params=params, headers=headers)
        res.raise_for_status()
        
        data = res.json()
        markets_data = data.get("markets", [])
        
        timestamps = set()
        ticker_data = {}
        tickers_list = market_tickers.split(",")
        suffixes = [t.split("-")[-1] for t in tickers_list]
        
        for m in markets_data:
            ticker = m.get("market_ticker", "")
            suffix = ticker.split("-")[-1]
            ticker_data[suffix] = {}
            for c in m.get("candlesticks", []):
                ts = c.get("end_period_ts")
                timestamps.add(ts)
                price_dollars = c.get("price", {}).get("close_dollars")
                if price_dollars is not None:
                    ticker_data[suffix][ts] = float(price_dollars) * 100
                    
        sorted_ts = sorted(list(timestamps))
        
        first_prices = {}
        for suffix in suffixes:
            t_data = ticker_data.get(suffix, {})
            if t_data:
                earliest_ts = min(t_data.keys())
                first_prices[suffix] = t_data[earliest_ts]
            else:
                first_prices[suffix] = 33.3
                
        aligned_history = []
        last_prices = first_prices.copy()
        for ts in sorted_ts:
            row = {"time": ts}
            for suffix in suffixes:
                if ts in ticker_data.get(suffix, {}):
                    last_prices[suffix] = ticker_data[suffix][ts]
                row[suffix.lower()] = last_prices[suffix]
            aligned_history.append(row)
            
        history_cache[cache_key] = (aligned_history, now)
        return jsonify(aligned_history)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True)

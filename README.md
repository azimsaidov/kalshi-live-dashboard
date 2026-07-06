# Kalshi Live Dashboard

A dashboard that uses the Kalshi API to track and plot contract probabilities in real-time. Plug in an event ticker (like `KXWCGAME-26JUN22ARGAUT` or `NASDAQ`) and it will draw the historical trajectory line graph and show live spreads.

## How to get it running

Set up a virtual environment and grab the dependencies:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Fire up the Flask server:
```bash
python app.py
```

Then open http://127.0.0.1:5001 in your browser.

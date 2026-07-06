let previousPrices = {};
let priceHistory = [];
let activeTicker = "";
let loadedTicker = "";

async function fetchMarkets() {
    const badge = document.getElementById("status-badge");
    const loading = document.getElementById("loading");
    const grid = document.getElementById("markets-grid");
    
    if (!activeTicker) {
        badge.innerText = "Ready";
        badge.className = "status-badge";
        if (loading) loading.style.display = "none";
        if (grid && !grid.querySelector(".welcome-message")) {
            grid.innerHTML = `
                <div class="welcome-message" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; color: #9ca3af;">
                    <div style="font-size: 3rem; margin-bottom: 1.5rem;">📊</div>
                    <h2 style="font-weight: 600; color: #fff; font-size: 1.5rem;">No Market Loaded</h2>
                    <p style="margin-top: 0.5rem; opacity: 0.8; font-size: 1rem;">Enter a Kalshi Event Ticker above (e.g., <strong>NASDAQ</strong>, <strong>FED</strong>, or <strong>KXECONSTATCPI</strong>) to start tracking live prediction markets.</p>
                </div>
            `;
        }
        return;
    }
    
    badge.innerText = "Syncing";
    badge.className = "status-badge syncing";
    
    try {
        const response = await fetch("/api/markets?ticker=" + activeTicker);
        const markets = await response.json();
        
        if (markets && markets.length > 0 && !markets.error) {
            const mainTitle = document.querySelector(".logo-area h1");
            const mainSubtitle = document.querySelector(".logo-area .subtitle");
            if (mainTitle && mainSubtitle) {
                let eventTitle = markets[0].title;
                if (eventTitle.endsWith(" Winner?")) {
                    eventTitle = eventTitle.replace(" Winner?", "");
                }
                mainTitle.innerText = eventTitle;
                mainSubtitle.innerText = markets[0].subtitle || "Kalshi Prediction Markets Tracker";
            }
            
            if (activeTicker !== loadedTicker) {
                const tickersList = markets.slice(0, 5).map(m => m.ticker).join(",");
                let startTs = Math.floor((Date.parse(markets[0].open_time) || Date.now() - 86400 * 30 * 1000) / 1000);
                priceHistory = [];
                fetch(`/api/history?market_tickers=${tickersList}&start_ts=${startTs}`)
                    .then(res => res.json())
                    .then(data => {
                        priceHistory = data;
                        loadedTicker = activeTicker;
                        drawWinnerChart();
                    })
                    .catch(e => console.error("Error loading history:", e));
            }
        }
        
        if (loading) {
            loading.style.display = "none";
        }
        
        if (markets && markets.length > 0 && !markets.error) {
            recordHistory(markets);
            
            let chartCard = document.getElementById("winner-chart-card");
            if (!chartCard) {
                chartCard = document.createElement("div");
                chartCard.id = "winner-chart-card";
                chartCard.className = "chart-card";
                grid.insertBefore(chartCard, grid.firstChild);
                chartCard.innerHTML = `
                    <span class="ticker-label">Live Probability Trend</span>
                    <h3 class="section-title" style="margin-bottom: 1.5rem;">Market Trajectory</h3>
                    <div class="chart-wrapper">
                        <canvas id="winner-chart"></canvas>
                    </div>
                    <div class="chart-legend"></div>
                `;
            }
            drawWinnerChart();
            
            const activeTickers = new Set(markets.map(m => m.ticker));
            Array.from(grid.children).forEach(card => {
                const keepChart = (card.id === "winner-chart-card");
                if (!activeTickers.has(card.id) && !keepChart) {
                    grid.removeChild(card);
                }
            });
            
            markets.forEach(market => {
                const ticker = market.ticker;
                let card = document.getElementById(ticker);
                const yesBid = market.yes_bid;
                const yesAsk = market.yes_ask;
                const lastPrice = market.last_price;
                
                const prev = previousPrices[ticker];
                let flashClass = "";
                if (prev !== undefined && prev !== lastPrice) {
                    flashClass = lastPrice > prev ? "flash-up" : "flash-down";
                }
                previousPrices[ticker] = lastPrice;
                
                let spreadStr = `${yesBid.toFixed(1)}¢ - ${yesAsk.toFixed(1)}¢`;
                if (yesBid === 0 && yesAsk === 100) {
                    spreadStr = "N/A (Empty Book)";
                }
                
                const cardHTML = `
                    <div class="market-header">
                        <span class="ticker-label">${ticker}</span>
                        <h3 class="market-title">${market.title}</h3>
                    </div>
                    
                    <div class="market-prices ${flashClass}" id="price-${ticker}">
                        <div class="price-col">
                            <div class="price-label">YES Spread</div>
                            <div class="price-value yes">${spreadStr}</div>
                        </div>
                        <div class="price-col">
                            <div class="price-label">Last Trade</div>
                            <div class="price-value no">${lastPrice.toFixed(1)}¢</div>
                        </div>
                    </div>
                    
                    <div class="market-meta">
                        <div class="meta-item">Volume: <span>${market.volume.toLocaleString(undefined, {maximumFractionDigits: 0})}</span></div>
                        <div class="meta-item">Open Interest: <span>${market.open_interest.toLocaleString(undefined, {maximumFractionDigits: 0})}</span></div>
                    </div>
                `;
                
                if (card) {
                    card.innerHTML = cardHTML;
                    const priceEl = document.getElementById(`price-${ticker}`);
                    if (flashClass && priceEl) {
                        setTimeout(() => {
                            priceEl.classList.remove("flash-up", "flash-down");
                        }, 1000);
                    }
                } else {
                    const newCard = document.createElement("div");
                    newCard.className = "market-card";
                    newCard.id = ticker;
                    newCard.innerHTML = cardHTML;
                    grid.appendChild(newCard);
                }
            });
        }
        
        badge.innerText = "Live";
        badge.className = "status-badge synced";
    } catch (error) {
        console.error("Error fetching markets:", error);
        badge.innerText = "Error";
        badge.className = "status-badge";
    }
}

function recordHistory(winnerMarkets) {
    if (priceHistory.length === 0) return;
    
    let lastEntry = priceHistory[priceHistory.length - 1];
    let nowSeconds = Math.floor(Date.now() / 1000);
    let targetEntry = lastEntry;
    
    const lastDate = new Date(lastEntry.time * 1000).toDateString();
    const currentDate = new Date(nowSeconds * 1000).toDateString();
    
    if (lastDate !== currentDate) {
        targetEntry = { time: nowSeconds };
        priceHistory.push(targetEntry);
        if (priceHistory.length > 200) {
            priceHistory.shift();
        }
    }
    
    winnerMarkets.forEach(m => {
        const suffix = m.ticker.split("-").pop().toLowerCase();
        targetEntry[suffix] = m.last_price;
    });
}

function drawWinnerChart() {
    const canvas = document.getElementById("winner-chart");
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (priceHistory.length < 1 || activeTicker !== loadedTicker) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = "14px 'Outfit', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Loading trajectory data...", width / 2, height / 2);
        return;
    }
    
    let drawPoints = [...priceHistory];
    if (drawPoints.length === 1) {
        drawPoints.push({
            ...drawPoints[0],
            time: Math.floor(Date.now() / 1000)
        });
    }
    
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 20;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px 'Outfit', sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    
    const gridLines = [0, 25, 50, 75, 100];
    gridLines.forEach(val => {
        const y = paddingTop + chartHeight - (val / 100) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();
        ctx.fillText(`${val}%`, paddingLeft - 8, y);
    });
    
    const keys = Object.keys(drawPoints[0]).filter(k => k !== "time");
    const colors = ["#00d2ff", "#ef4444", "#10b981", "#fbbf24", "#a78bfa", "#f472b6", "#60a5fa", "#34d399"];
    const lines = keys.map((key, idx) => ({
        key: key,
        color: colors[idx % colors.length]
    }));
    
    const legendContainer = document.querySelector(".chart-legend");
    if (legendContainer) {
        legendContainer.innerHTML = lines.map(line => `
            <span class="legend-item">
                <span class="legend-dot" style="background-color: ${line.color}; box-shadow: 0 0 8px ${line.color}80;"></span>
                ${line.key.toUpperCase()}
            </span>
        `).join("");
    }
    
    lines.forEach(line => {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        
        ctx.shadowBlur = 6;
        ctx.shadowColor = line.color + "40";
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        
        ctx.beginPath();
        let first = true;
        drawPoints.forEach((point, idx) => {
            const val = point[line.key];
            if (val === undefined) return;
            const x = paddingLeft + (idx / (drawPoints.length - 1)) * chartWidth;
            const y = paddingTop + chartHeight - (val / 100) * chartHeight;
            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        const lastIdx = drawPoints.length - 1;
        const lastPoint = drawPoints[lastIdx];
        const lastVal = lastPoint[line.key];
        if (lastVal !== undefined) {
            const lastX = paddingLeft + chartWidth;
            const lastY = paddingTop + chartHeight - (lastVal / 100) * chartHeight;
            
            ctx.fillStyle = line.color;
            ctx.beginPath();
            ctx.arc(lastX, lastY, 4, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.strokeStyle = "#0b0f19";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(lastX, lastY, 4, 0, 2 * Math.PI);
            ctx.stroke();
        }
    });
}

function loadCustomTicker() {
    const input = document.getElementById("ticker-input");
    if (!input) return;
    
    let ticker = input.value.trim().toUpperCase();
    if (!ticker) return;
    
    const parts = ticker.split("-");
    if (parts.length > 2) {
        ticker = parts.slice(0, 2).join("-");
    }
    
    activeTicker = ticker;
    
    document.getElementById("markets-grid").innerHTML = "";
    document.getElementById("loading").style.display = "flex";
    loadedTicker = "";
    previousPrices = {};
    
    fetchMarkets();
}

window.addEventListener("resize", () => {
    drawWinnerChart();
});

async function initHistory() {
    loadedTicker = "";
    fetchMarkets();
    setInterval(fetchMarkets, 5000);
}

initHistory();

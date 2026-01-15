// ============================================
// FairChance Lottery - Frontend Conectado a BSC
// ============================================

// --- CONFIGURACIÓN DEL CONTRATO ---
const CONTRACT_ADDRESS = "0x59d2A5a1518f331550d680A8C777A1c5F0F4D38d"; // Tu contrato en BSC Mainnet
const TICKET_PRICE_BNB = "0.002"; // Precio en BNB (~$1 USD)
const BNB_PRICE_USD = 600; // Precio aproximado de BNB (actualizar según mercado)

// ABI mínimo para leer el contrato
const CONTRACT_ABI = [
    "function ticketPrice() view returns (uint256)",
    "function lotteryEndTime() view returns (uint256)",
    "function minPoolToDraw() view returns (uint256)",
    "function lotteryId() view returns (uint256)",
    "function buyTickets() payable",
    "event NewTicketBought(address indexed player, uint256 amount)"
];

let provider, signer, contract, readOnlyProvider;
let userAddress = null;

// Elementos del DOM
const connectBtn = document.getElementById('connectBtn');
const buyBtn = document.getElementById('buyBtn');
const ticketInput = document.getElementById('ticketInput');
const btnMinus = document.getElementById('btnMinus');
const btnPlus = document.getElementById('btnPlus');
const totalCostEl = document.getElementById('totalCost');
const jackpotEl = document.getElementById('jackpotAmount');
const txList = document.getElementById('txList');
const countdownEl = document.getElementById('countdown');

// --- INICIALIZACIÓN: Leer balance REAL del contrato ---
async function initializeRealData() {
    try {
        // Conectar a BSC Mainnet (lectura pública, sin wallet)
        readOnlyProvider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed1.binance.org/");

        // Leer balance del contrato
        const balanceWei = await readOnlyProvider.getBalance(CONTRACT_ADDRESS);
        const balanceBNB = parseFloat(ethers.utils.formatEther(balanceWei));
        const balanceUSD = (balanceBNB * BNB_PRICE_USD).toFixed(2);

        // Actualizar UI con valor REAL
        jackpotEl.innerText = '$' + balanceUSD;

        console.log("Pozo Real:", balanceBNB, "BNB (~$" + balanceUSD + " USD)");

        // Leer tiempo restante del contrato
        const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readOnlyProvider);
        const endTime = await readContract.lotteryEndTime();
        startCountdown(endTime.toNumber());

    } catch (error) {
        console.error("Error leyendo blockchain:", error);
        jackpotEl.innerText = '$0.00';
    }
}

// --- COUNTDOWN REAL ---
function startCountdown(endTimestamp) {
    const updateTimer = () => {
        const now = Math.floor(Date.now() / 1000);
        let remaining = endTimestamp - now;

        if (remaining <= 0) {
            countdownEl.innerText = "¡Sorteo Pendiente!";
            return;
        }

        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;

        countdownEl.innerText = `${hours}h : ${String(minutes).padStart(2, '0')}m : ${String(seconds).padStart(2, '0')}s`;
    };

    updateTimer();
    setInterval(updateTimer, 1000);
}

// --- CONEXIÓN DE WALLET ---
connectBtn.addEventListener('click', async () => {
    if (window.ethereum) {
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();

            // Crear instancia del contrato con signer
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            // UI Update
            connectBtn.innerText = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
            connectBtn.classList.add('connected');
            buyBtn.disabled = false;
            buyBtn.innerText = "🎟️ Comprar Tickets";

            console.log("Conectado:", userAddress);
        } catch (error) {
            console.error(error);
            alert("Error al conectar billetera.");
        }
    } else {
        alert("Por favor instala MetaMask o TrustWallet para participar.");
    }
});

// --- CONTROL DE TICKETS ---
btnMinus.addEventListener('click', () => {
    let val = parseInt(ticketInput.value);
    if (val > 1) {
        ticketInput.value = val - 1;
        updateCost();
    }
});

btnPlus.addEventListener('click', () => {
    let val = parseInt(ticketInput.value);
    if (val < 20) {
        ticketInput.value = val + 1;
        updateCost();
    }
});

function updateCost() {
    let count = parseInt(ticketInput.value);
    let totalBNB = (count * parseFloat(TICKET_PRICE_BNB)).toFixed(4);
    totalCostEl.innerText = totalBNB;
}

// --- COMPRA REAL DE TICKETS ---
buyBtn.addEventListener('click', async () => {
    if (!userAddress || !contract) {
        alert("Primero conecta tu billetera.");
        return;
    }

    const ticketCount = parseInt(ticketInput.value);
    const totalBNB = (ticketCount * parseFloat(TICKET_PRICE_BNB)).toFixed(4);

    buyBtn.innerText = "⏳ Procesando...";
    buyBtn.disabled = true;

    try {
        // Llamada REAL al contrato
        const tx = await contract.buyTickets({
            value: ethers.utils.parseEther(totalBNB)
        });

        buyBtn.innerText = "⛓️ Confirmando...";
        await tx.wait();

        alert(`¡Compra Exitosa! 🎉\n\nCompraste ${ticketCount} ticket(s).\nTx: ${tx.hash.slice(0, 20)}...`);

        // Actualizar pozo
        initializeRealData();

        // Añadir al feed
        addTransaction(userAddress, ticketCount, tx.hash);

    } catch (error) {
        console.error(error);
        if (error.code === 4001) {
            alert("Transacción cancelada por el usuario.");
        } else {
            alert("Error en la transacción: " + (error.reason || error.message));
        }
    }

    buyBtn.innerText = "🎟️ Comprar Tickets";
    buyBtn.disabled = false;
});

// --- FEED DE TRANSACCIONES EN VIVO (Últimas 10 persistentes) ---
const MAX_TRANSACTIONS_DISPLAYED = 10;
let displayedTransactions = []; // Array para trackear transacciones mostradas

function addTransaction(addr, tickets, txHash, timestamp = null) {
    // Evitar duplicados
    if (displayedTransactions.includes(txHash)) return;

    const div = document.createElement('div');
    div.className = 'tx-item';
    div.setAttribute('data-txhash', txHash);

    // Calcular tiempo relativo
    const timeAgo = timestamp ? getRelativeTime(timestamp) : 'Ahora';

    div.innerHTML = `
        <div class="tx-info">
            <span class="tx-address">🎫 ${addr.slice(0, 6)}...${addr.slice(-4)}</span>
            <span class="tx-details">compró <strong>${tickets}</strong> ticket(s)</span>
        </div>
        <div class="tx-meta">
            <span class="tx-time">${timeAgo}</span>
            <a href="https://bscscan.com/tx/${txHash}" target="_blank" class="tx-hash">Ver ↗</a>
        </div>
    `;

    // Limpiar estado vacío
    if (txList.querySelector('.empty-state')) {
        txList.innerHTML = '';
    }

    // Añadir al inicio con animación
    div.style.animation = 'slideIn 0.4s ease-out';
    txList.prepend(div);
    displayedTransactions.unshift(txHash);

    // Mantener solo las últimas 10
    while (txList.children.length > MAX_TRANSACTIONS_DISPLAYED) {
        const lastChild = txList.lastElementChild;
        const lastHash = lastChild.getAttribute('data-txhash');
        displayedTransactions = displayedTransactions.filter(h => h !== lastHash);
        lastChild.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => lastChild.remove(), 300);
    }
}

// Función para tiempo relativo
function getRelativeTime(timestamp) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return 'Hace segundos';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
    return `Hace ${Math.floor(diff / 86400)}d`;
}

// --- CARGAR ÚLTIMAS 10 TRANSACCIONES DESDE BLOCKCHAIN ---
async function loadRecentTransactions() {
    // Mostrar estado de carga
    txList.innerHTML = `
        <div class="empty-state">
            <span class="empty-icon">🔄</span>
            <p>Cargando actividad reciente...</p>
        </div>
    `;

    // Lista de RPCs de BSC (fallback)
    const rpcEndpoints = [
        "https://bsc-dataseed1.binance.org/",
        "https://bsc-dataseed2.binance.org/",
        "https://bsc-dataseed3.binance.org/",
        "https://bsc-dataseed4.binance.org/"
    ];

    let provider = null;
    let events = [];

    // Intentar con diferentes RPCs
    for (const rpc of rpcEndpoints) {
        try {
            provider = new ethers.providers.JsonRpcProvider(rpc);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, [
                "event NewTicketBought(address indexed player, uint256 amount)"
            ], provider);

            // Buscar en lotes más pequeños (5000 bloques = ~4 horas)
            const currentBlock = await provider.getBlockNumber();
            const filter = contract.filters.NewTicketBought();

            // Buscar primero en los últimos 5000 bloques
            let fromBlock = Math.max(0, currentBlock - 5000);
            events = await contract.queryFilter(filter, fromBlock, 'latest');

            // Si no hay eventos, buscar más atrás (hasta 20000 bloques)
            if (events.length === 0) {
                fromBlock = Math.max(0, currentBlock - 20000);
                events = await contract.queryFilter(filter, fromBlock, currentBlock - 5000);
            }

            console.log(`RPC ${rpc} funcionó. Encontrados ${events.length} eventos.`);
            break; // Salir del loop si funcionó

        } catch (error) {
            console.warn(`RPC ${rpc} falló:`, error.message);
            continue; // Probar siguiente RPC
        }
    }

    // Si no encontramos eventos después de todos los intentos
    if (events.length === 0) {
        txList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">👀</span>
                <p>Esperando la primera compra...</p>
                <p class="empty-subtitle">¡Sé el primero en participar!</p>
            </div>
        `;
        return;
    }

    try {
        // Ordenar por bloque (más reciente primero) y tomar últimos 10
        const sortedEvents = events.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 10);

        // Obtener timestamps de los bloques
        const eventsWithTime = await Promise.all(sortedEvents.map(async (event) => {
            try {
                const block = await provider.getBlock(event.blockNumber);
                return {
                    player: event.args.player,
                    amount: event.args.amount.toNumber(),
                    txHash: event.transactionHash,
                    timestamp: block ? block.timestamp : Math.floor(Date.now() / 1000)
                };
            } catch (e) {
                return {
                    player: event.args.player,
                    amount: event.args.amount.toNumber(),
                    txHash: event.transactionHash,
                    timestamp: Math.floor(Date.now() / 1000)
                };
            }
        }));

        // Limpiar y mostrar (del más antiguo al más nuevo para que prepend funcione correctamente)
        txList.innerHTML = '';
        displayedTransactions = [];

        eventsWithTime.reverse().forEach(tx => {
            addTransaction(tx.player, tx.amount, tx.txHash, tx.timestamp);
        });

        console.log(`✅ Cargadas ${eventsWithTime.length} transacciones recientes`);

    } catch (error) {
        console.error("Error procesando transacciones:", error);
        txList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">�</span>
                <p>Esperando compras recientes...</p>
                <p class="empty-subtitle">Las nuevas compras aparecerán aquí</p>
            </div>
        `;
    }
}

// --- ESCUCHAR NUEVAS TRANSACCIONES EN TIEMPO REAL ---
async function listenForNewTransactions() {
    try {
        // Usar WebSocket para eventos en tiempo real
        const wsProvider = new ethers.providers.WebSocketProvider("wss://bsc-ws-node.nariox.org:443");
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "event NewTicketBought(address indexed player, uint256 amount)"
        ], wsProvider);

        contract.on("NewTicketBought", (player, amount, event) => {
            console.log("🎫 Nueva compra detectada:", player, amount.toNumber());
            addTransaction(player, amount.toNumber(), event.transactionHash);
            // Actualizar el pozo también
            initializeRealData();
        });

        console.log("✅ Escuchando transacciones en tiempo real...");

    } catch (error) {
        console.error("WebSocket no disponible, usando polling:", error);
        // Fallback: refrescar cada 30 segundos
        setInterval(loadRecentTransactions, 30000);
    }
}

// --- INICIALIZAR AL CARGAR ---
updateCost();
initializeRealData();
loadRecentTransactions();
listenForNewTransactions();
loadWinnersHistory();

// --- CARGAR HISTORIAL DE GANADORES ---
async function loadWinnersHistory() {
    const winnersList = document.getElementById('winnersList');
    if (!winnersList) return;

    try {
        const provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed1.binance.org/");
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "event WinnerPicked(address indexed winner, uint256 prize, uint256 lotteryId)"
        ], provider);

        // Buscar eventos desde el bloque de creación del contrato
        const filter = contract.filters.WinnerPicked();
        const events = await contract.queryFilter(filter, 0, 'latest');

        if (events.length === 0) {
            winnersList.innerHTML = `
                <div class="no-winners">
                    <span class="no-winners-icon">🎰</span>
                    <p>Aún no ha habido ningún sorteo. ¡Sé parte del primer ganador!</p>
                </div>
            `;
            return;
        }

        // Mostrar ganadores (más reciente primero)
        winnersList.innerHTML = '';
        const reversedEvents = events.reverse();

        for (const event of reversedEvents.slice(0, 10)) { // Últimos 10
            const winner = event.args.winner;
            const prizeWei = event.args.prize;
            const lotteryId = event.args.lotteryId.toString();
            const txHash = event.transactionHash;

            const prizeBNB = parseFloat(ethers.utils.formatEther(prizeWei));
            const prizeUSD = (prizeBNB * BNB_PRICE_USD).toFixed(2);

            const winnerCard = document.createElement('div');
            winnerCard.className = 'winner-card';
            winnerCard.innerHTML = `
                <div class="winner-info">
                    <span class="winner-round">Ronda #${lotteryId}</span>
                    <span class="winner-address">${winner.slice(0, 8)}...${winner.slice(-6)}</span>
                </div>
                <div class="winner-prize">
                    <span class="prize-amount">$${prizeUSD} USD</span>
                    <span class="prize-bnb">(${prizeBNB.toFixed(4)} BNB)</span>
                </div>
                <a href="https://bscscan.com/tx/${txHash}" target="_blank" class="verify-btn">
                    ✓ Verificar en BscScan
                </a>
            `;
            winnersList.appendChild(winnerCard);
        }

    } catch (error) {
        console.error("Error cargando ganadores:", error);
        winnersList.innerHTML = `
            <div class="error-state">
                <p>No se pudo cargar el historial. Verifica directamente en 
                <a href="https://bscscan.com/address/${CONTRACT_ADDRESS}#events" target="_blank">BscScan</a>.</p>
            </div>
        `;
    }
}

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
        readOnlyProvider = new ethers.providers.JsonRpcProvider("https://bsc-rpc.publicnode.com");

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

// --- FEED DE TRANSACCIONES EN VIVO (Últimas 10 persistentes con localStorage) ---
const MAX_TRANSACTIONS_DISPLAYED = 10;
const STORAGE_KEY = 'fairchance_transactions';
let displayedTransactions = []; // Array para trackear transacciones mostradas

// Guardar transacciones en localStorage
function saveTransactionsToStorage(transactions) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions.slice(0, MAX_TRANSACTIONS_DISPLAYED)));
    } catch (e) {
        console.warn('No se pudo guardar en localStorage:', e);
    }
}

// Cargar transacciones desde localStorage
function loadTransactionsFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.warn('No se pudo cargar desde localStorage:', e);
        return [];
    }
}

function addTransaction(addr, tickets, txHash, timestamp = null, saveToStorage = true) {
    // Evitar duplicados
    if (displayedTransactions.includes(txHash)) return;

    const div = document.createElement('div');
    div.className = 'tx-item';
    div.setAttribute('data-txhash', txHash);

    // Calcular tiempo relativo
    const txTimestamp = timestamp || Math.floor(Date.now() / 1000);
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

    // Guardar en localStorage si es nueva transacción
    if (saveToStorage) {
        const stored = loadTransactionsFromStorage();
        stored.unshift({ addr, tickets, txHash, timestamp: txTimestamp });
        saveTransactionsToStorage(stored);
        console.log('💾 Transacción guardada en localStorage');
    }

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

// --- CARGAR ÚLTIMAS TRANSACCIONES (RPC PÚBLICO) ---
// --- CARGAR ÚLTIMAS TRANSACCIONES (MÉTODO DIRECTO) ---
// Leemos el array 'players' directamente para evitar problemas de indexado de eventos RPC.
async function loadLiveActivity() {
    try {
        if (!readOnlyProvider) {
            readOnlyProvider = new ethers.providers.JsonRpcProvider("https://bsc-rpc.publicnode.com");
        }

        // Usamos un contrato con el ABI específico para leer el array
        const contractReader = new ethers.Contract(CONTRACT_ADDRESS, [
            "function players(uint256) view returns (address)"
        ], readOnlyProvider);

        const players = [];
        let index = 0;
        const MAX_SAFETY = 200; // Límite de seguridad para evitar loops infinitos

        console.log("🔄 Leyendo tickets directamente del contrato...");

        // Iterar hasta que falle la llamada (fin del array)
        while (true) {
            try {
                const player = await contractReader.players(index);
                players.push(player);
                index++;
                if (index >= MAX_SAFETY) break;
            } catch (e) {
                // Fin del array (o error de red), paramos aquí
                break;
            }
        }

        if (players.length === 0) {
            // Si no hay jugadores, mostramos empty state
            if (txList.children.length === 0) {
                txList.innerHTML = `
                   <div class="empty-state">
                       <span class="empty-icon">👀</span>
                       <p>Esperando la primera compra de esta ronda...</p>
                   </div>
               `;
            }
            return;
        }

        // Agrupar tickets consecutivos del mismo jugador
        const transactions = [];
        let currentAddr = players[0];
        let count = 1;

        for (let i = 1; i < players.length; i++) {
            if (players[i] === currentAddr) {
                count++;
            } else {
                transactions.push({ addr: currentAddr, tickets: count });
                currentAddr = players[i];
                count = 1;
            }
        }
        transactions.push({ addr: currentAddr, tickets: count });

        // Limpiar "Empty state" si existe
        if (txList.querySelector('.empty-state')) {
            txList.innerHTML = '';
        }

        // Mostrar transacciones (Invertido: el último comprado va primero)
        const recentTx = transactions.reverse();

        for (const tx of recentTx) {
            // Generamos un ID único basado en el contenido para deduplicar
            const fakeHash = ethers.utils.id(tx.addr + tx.tickets + index);

            // timestamp null para que diga "Hace poco" (o manejado por la app)
            addTransaction(tx.addr, tx.tickets, fakeHash, null, false);
        }

        console.log(`✅ Actividad cargada: ${transactions.length} transacciones.`);

    } catch (error) {
        console.error("Error cargando actividad:", error);
    }
}


// --- ESCUCHAR NUEVAS TRANSACCIONES (POLLING ROBUSTO) ---
function startTransactionPolling() {
    // Carga inicial
    loadLiveActivity();

    // Polling cada 7 segundos (más rápido porque es lectura ligera)
    setInterval(() => {
        loadLiveActivity();
        // También actualizar el pozo
        initializeRealData();
    }, 7000);

    console.log("🔄 Sistema de actualización en vivo activado (Lectura Directa)");
}

// --- INICIALIZAR AL CARGAR ---
updateCost();
initializeRealData();
startTransactionPolling();
loadWinnersHistory();

// --- CARGAR HISTORIAL DE GANADORES ---
async function loadWinnersHistory() {
    const winnersList = document.getElementById('winnersList');
    if (!winnersList) return;

    try {
        const provider = new ethers.providers.JsonRpcProvider("https://bsc-rpc.publicnode.com");
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "event WinnerPicked(address indexed winner, uint256 prize, uint256 lotteryId)"
        ], provider);

        // Buscar eventos en los últimos 5000 bloques (~4 horas) para evitar limit exceeded
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 5000);
        const filter = contract.filters.WinnerPicked();
        const events = await contract.queryFilter(filter, fromBlock, 'latest');

        if (events.length === 0) {
            winnersList.innerHTML = `
    < div class="no-winners" >
                    <span class="no-winners-icon">🎰</span>
                    <p>Aún no ha habido ningún sorteo. ¡Sé parte del primer ganador!</p>
                </div >
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
    < div class="winner-info" >
                    <span class="winner-round">Ronda #${lotteryId}</span>
                    <span class="winner-address">${winner.slice(0, 8)}...${winner.slice(-6)}</span>
                </div >
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
    < div class="error-state" >
        <p>No se pudo cargar el historial. Verifica directamente en
            <a href="https://bscscan.com/address/${CONTRACT_ADDRESS}#events" target="_blank">BscScan</a>.</p>
            </div >
    `;
    }
}

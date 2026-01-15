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

// --- FEED DE TRANSACCIONES ---
function addTransaction(addr, tickets, txHash) {
    const div = document.createElement('div');
    div.className = 'tx-item';
    div.innerHTML = `
        <a href="https://bscscan.com/tx/${txHash}" target="_blank" class="tx-hash">Ver Tx ↗</a>
        <span>${addr.slice(0, 6)}...${addr.slice(-4)} compró ${tickets} ticket(s)</span>
    `;

    if (txList.querySelector('.empty-state')) {
        txList.innerHTML = '';
    }

    txList.prepend(div);
}

// --- INICIALIZAR AL CARGAR ---
updateCost();
initializeRealData();

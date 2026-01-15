// Configuración básica
const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // Reemplazar despues del despliegue
const TICKET_PRICE_USD = 1;
// Aproximadamente 0.003 BNB por $1 (Valor fijo para la demo, en prod se usaría un oráculo o API)
const BNB_PER_USD = 0.003; 

let provider, signer, contract;
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

// Lógica de Conexión
connectBtn.addEventListener('click', async () => {
    if (window.ethereum) {
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            
            // UI Update
            connectBtn.innerText = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
            connectBtn.classList.add('connected');
            buyBtn.disabled = false;
            buyBtn.innerText = "Comprar Tickets";
            
            console.log("Conectado:", userAddress);
        } catch (error) {
            console.error(error);
            alert("Error al conectar billetera.");
        }
    } else {
        alert("Por favor instala MetaMask o TrustWallet para participar.");
    }
});

// Control de Tickets
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
    let totalBNB = (count * TICKET_PRICE_USD * BNB_PER_USD).toFixed(3);
    totalCostEl.innerText = totalBNB;
}

// Simulación de Compra (Mock para Demo)
buyBtn.addEventListener('click', async () => {
    if (!userAddress) return;
    
    // Aquí iría la llamada real al contrato:
    // await contract.buyTickets({ value: ethers.utils.parseEther(totalBNB) })
    
    // Efecto visual de carga
    buyBtn.innerText = "Procesando...";
    buyBtn.disabled = true;

    setTimeout(() => {
        alert("¡Transacción Simulada Exitosa! \n\nEn la versión real, tu billetera firmaría la compra.");
        
        // Añadir al feed falso
        addFakeTransaction(userAddress, ticketInput.value);
        
        // Reset
        buyBtn.innerText = "Comprar Tickets";
        buyBtn.disabled = false;
    }, 2000);
});

// Utilidades Mock
function addFakeTransaction(addr, tickets) {
    const div = document.createElement('div');
    div.className = 'tx-item';
    div.innerHTML = `
        <span class="tx-hash">Ticket #${Math.floor(Math.random()*1000)}</span>
        <span>${addr.slice(0,6)}... compró ${tickets} ticket(s)</span>
    `;
    
    // Eliminar estado vacío si existe
    if(txList.querySelector('.empty-state')) {
        txList.innerHTML = '';
    }
    
    txList.prepend(div);
    
    // Actualizar pozo falso
    let currentJackpot = parseFloat(jackpotEl.innerText.replace('$',''));
    jackpotEl.innerText = '$' + (currentJackpot + (tickets * 1)).toFixed(2);
}

// Inicializar Mock Data
updateCost();
jackpotEl.innerText = '$145.00'; // Valor inicial atractivo

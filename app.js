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
 
 / /   - - -   C A R G A R   H I S T O R I A L   D E   G A N A D O R E S   - - -  
 a s y n c   f u n c t i o n   l o a d W i n n e r s H i s t o r y ( )   {  
         c o n s t   w i n n e r s L i s t   =   d o c u m e n t . g e t E l e m e n t B y I d ( ' w i n n e r s L i s t ' ) ;  
         i f   ( ! w i n n e r s L i s t )   r e t u r n ;  
  
         t r y   {  
                 c o n s t   p r o v i d e r   =   n e w   e t h e r s . p r o v i d e r s . J s o n R p c P r o v i d e r ( " h t t p s : / / b s c - r p c . p u b l i c n o d e . c o m " ) ;  
                 c o n s t   c o n t r a c t   =   n e w   e t h e r s . C o n t r a c t ( C O N T R A C T _ A D D R E S S ,   [  
                         " e v e n t   W i n n e r P i c k e d ( a d d r e s s   i n d e x e d   w i n n e r ,   u i n t 2 5 6   p r i z e ,   u i n t 2 5 6   l o t t e r y I d ) "  
                 ] ,   p r o v i d e r ) ;  
  
                 / /   B u s c a r   e v e n t o s   e n   l o s   � � l t i m o s   5 0 0 0   b l o q u e s   ( ~ 4   h o r a s )   p a r a   e v i t a r   l i m i t   e x c e e d e d  
                 c o n s t   c u r r e n t B l o c k   =   a w a i t   p r o v i d e r . g e t B l o c k N u m b e r ( ) ;  
                 c o n s t   f r o m B l o c k   =   M a t h . m a x ( 0 ,   c u r r e n t B l o c k   -   5 0 0 0 ) ;  
                 c o n s t   f i l t e r   =   c o n t r a c t . f i l t e r s . W i n n e r P i c k e d ( ) ;  
                 c o n s t   e v e n t s   =   a w a i t   c o n t r a c t . q u e r y F i l t e r ( f i l t e r ,   f r o m B l o c k ,   ' l a t e s t ' ) ;  
  
                 i f   ( e v e n t s . l e n g t h   = = =   0 )   {  
                         w i n n e r s L i s t . i n n e r H T M L   =   `  
                                 < d i v   c l a s s = " n o - w i n n e r s " >  
                                         < s p a n   c l a s s = " n o - w i n n e r s - i c o n " > � x}� < / s p a n >  
                                         < p > A � � n   n o   h a   h a b i d o   n i n g � � n   s o r t e o .   � � S � �   p a r t e   d e l   p r i m e r   g a n a d o r ! < / p >  
                                 < / d i v >  
                         ` ;  
                         r e t u r n ;  
                 }  
  
                 / /   M o s t r a r   g a n a d o r e s   ( m � � s   r e c i e n t e   p r i m e r o )  
                 w i n n e r s L i s t . i n n e r H T M L   =   ' ' ;  
                 c o n s t   r e v e r s e d E v e n t s   =   e v e n t s . r e v e r s e ( ) ;  
  
                 f o r   ( c o n s t   e v e n t   o f   r e v e r s e d E v e n t s . s l i c e ( 0 ,   1 0 ) )   {   / /   � al t i m o s   1 0  
                         c o n s t   w i n n e r   =   e v e n t . a r g s . w i n n e r ;  
                         c o n s t   p r i z e W e i   =   e v e n t . a r g s . p r i z e ;  
                         c o n s t   l o t t e r y I d   =   e v e n t . a r g s . l o t t e r y I d . t o S t r i n g ( ) ;  
                         c o n s t   t x H a s h   =   e v e n t . t r a n s a c t i o n H a s h ;  
  
                         c o n s t   p r i z e B N B   =   p a r s e F l o a t ( e t h e r s . u t i l s . f o r m a t E t h e r ( p r i z e W e i ) ) ;  
                         c o n s t   p r i z e U S D   =   ( p r i z e B N B   *   B N B _ P R I C E _ U S D ) . t o F i x e d ( 2 ) ;  
  
                         c o n s t   w i n n e r C a r d   =   d o c u m e n t . c r e a t e E l e m e n t ( ' d i v ' ) ;  
                         w i n n e r C a r d . c l a s s N a m e   =   ' w i n n e r - c a r d ' ;  
                         w i n n e r C a r d . i n n e r H T M L   =   `  
                                 < d i v   c l a s s = " w i n n e r - i n f o " >  
                                         < s p a n   c l a s s = " w i n n e r - r o u n d " > R o n d a   # $ { l o t t e r y I d } < / s p a n >  
                                         < s p a n   c l a s s = " w i n n e r - a d d r e s s " > $ { w i n n e r . s l i c e ( 0 ,   8 ) } . . . $ { w i n n e r . s l i c e ( - 6 ) } < / s p a n >  
                                 < / d i v >  
                                 < d i v   c l a s s = " w i n n e r - p r i z e " >  
                                         < s p a n   c l a s s = " p r i z e - a m o u n t " > $ $ { p r i z e U S D }   U S D < / s p a n >  
                                         < s p a n   c l a s s = " p r i z e - b n b " > ( $ { p r i z e B N B . t o F i x e d ( 4 ) }   B N B ) < / s p a n >  
                                 < / d i v >  
                                 < a   h r e f = " h t t p s : / / b s c s c a n . c o m / t x / $ { t x H a s h } "   t a r g e t = " _ b l a n k "   c l a s s = " v e r i f y - b t n " >  
                                         � S   V e r i f i c a r   e n   B s c S c a n  
                                 < / a >  
                         ` ;  
                         w i n n e r s L i s t . a p p e n d C h i l d ( w i n n e r C a r d ) ;  
                 }  
  
         }   c a t c h   ( e r r o r )   {  
                 c o n s o l e . e r r o r ( " E r r o r   c a r g a n d o   g a n a d o r e s : " ,   e r r o r ) ;  
                 w i n n e r s L i s t . i n n e r H T M L   =   `  
                         < d i v   c l a s s = " e r r o r - s t a t e " >  
                                 < p > N o   s e   p u d o   c a r g a r   e l   h i s t o r i a l .   V e r i f i c a   d i r e c t a m e n t e   e n    
                                 < a   h r e f = " h t t p s : / / b s c s c a n . c o m / a d d r e s s / $ { C O N T R A C T _ A D D R E S S } # e v e n t s "   t a r g e t = " _ b l a n k " > B s c S c a n < / a > . < / p >  
                         < / d i v >  
                 ` ;  
         }  
 }  
 
/*
 * HANA World Token 관리자 페이지
 * Network: Binance Smart Chain Mainnet (56)
 * 보안 강화 및 에러 핸들링 개선 버전
 */
let Network = 56; // Binance Smart Chain Mainnet
const NETWORKS = {
  "56": { name: "bsc", explorer: "https://bscscan.com", chainName: "Binance Smart Chain", nativeCurrency: "BNB" }
};

var WalletAddress = "";
var web3;
var ethersProvider;
var ethersSigner;

// ====== 유틸 함수 ======
function isValidEthereumAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidAmount(amount, min = 0, max = 1000000000) {
  const num = Number(amount);
  return !isNaN(num) && num >= min && num <= max;
}

function isValidInteger(amount, min = 1, max = 1000000000) {
  const num = Number(amount);
  return !isNaN(num) && Number.isInteger(num) && num >= min && num <= max;
}

function fmtToken(bn) {
  try { return `${ethers.utils.formatEther(bn)} HWT`; } catch (_) { return '-'; }
}

function fmtBNB(bn) {
  try {
    const currency = getNetworkInfo().nativeCurrency;
    return `${ethers.utils.formatEther(bn)} ${currency}`;
  } catch (_) { return '-'; }
}

// ====== 디바이스 감지 ======
function detectDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;

  // iOS 감지
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
    return 'iOS';
  }

  // Android 감지
  if (/android/i.test(ua)) {
    return 'Android';
  }

  // 데스크탑
  return 'Desktop';
}

function redirectToMetaMask() {
  const device = detectDevice();
  const currentUrl = window.location.href;

  if (device === 'iOS') {
    // iOS App Store
    window.location.href = 'https://apps.apple.com/app/metamask/id1438144202';
  } else if (device === 'Android') {
    // Android Play Store
    window.location.href = 'https://play.google.com/store/apps/details?id=io.metamask';
  } else {
    // Desktop - Chrome Web Store
    window.location.href = 'https://metamask.io/download/';
  }
}

function openInMetaMaskBrowser() {
  const device = detectDevice();
  const currentUrl = window.location.href;

  if (device === 'iOS' || device === 'Android') {
    // MetaMask 딥링크로 현재 페이지 열기
    const metamaskDeepLink = `https://metamask.app.link/dapp/${currentUrl.replace(/^https?:\/\//, '')}`;
    window.location.href = metamaskDeepLink;

    // 3초 후에도 MetaMask 앱이 열리지 않으면 스토어로 이동
    setTimeout(() => {
      redirectToMetaMask();
    }, 3000);
  } else {
    // 데스크탑은 바로 설치 페이지로
    redirectToMetaMask();
  }
}

function rebuildProviders() {
  if (!window.ethereum) return;
  web3 = new Web3(window.ethereum);
  ethersProvider = new ethers.providers.Web3Provider(window.ethereum);
  ethersSigner = ethersProvider.getSigner();
}

function createInput({ id, placeholder, className = 'form-input', type = 'text', attrs = {} }) {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.placeholder = placeholder;
  input.className = className;
  Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
  return input;
}

function createRow(children = [], gap = '8px') {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = gap;
  row.style.flexWrap = 'wrap';
  children.forEach(ch => row.appendChild(ch));
  return row;
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.innerText = v;
}

function getNetworkInfo() {
  return NETWORKS[Network.toString()] || {
    name: "unknown",
    explorer: "",
    chainName: "Unknown Network",
    nativeCurrency: "BNB"
  };
}

function getExplorerUrl() {
  return getNetworkInfo().explorer;
}

// ====== 에러 처리 (보안 강화) ======
function friendlyError(e) {
  try {
    // 사용자 거부
    if (e && (e.code === 4001 || e.code === 'ACTION_REJECTED' || (e.message || '').toLowerCase().includes('user rejected'))) {
      return '트랜잭션을 취소하였습니다.';
    }

    const msg = (e?.data?.message) || (e?.error?.message) || (e?.message) || String(e);

    // RPC 관련 에러 (타임아웃, 연결 문제)
    if (/timeout|timed out|could not detect network|missing response|failed to fetch|network request failed/i.test(msg)) {
      return 'RPC 서버 응답 대기 중 타임아웃이 발생했습니다.\n\n트랜잭션은 전송되었을 수 있으니 BscScan에서 확인해주세요.\n잠시 후 페이지를 새로고침하여 상태를 확인하세요.';
    }

    // 컨트랙트 연결 실패
    if (/Returned values aren't valid|did it run Out of Gas|not using the correct ABI|requesting data from a block number that does not exist|node which is not fully synced/i.test(msg)) {
      return '현재 네트워크에서 컨트랙트를 찾을 수 없습니다. BSC 메인넷(Chain ID: 56)에 연결되어 있는지 확인해주세요.';
    }

    // 컨트랙트 실행 에러 (구체적인 이유 파싱)
    if (/execution reverted|call exception|contract call failed/i.test(msg)) {
      // Revert 이유 추출
      const revertMatch = msg.match(/reverted with reason string ['"]([^'"]+)['"]/i);
      if (revertMatch) {
        return `컨트랙트 실행 거부: ${revertMatch[1]}`;
      }

      // 특정 에러 메시지 매칭
      if (/NoLockupExists/i.test(msg)) return '락업이 존재하지 않습니다.';
      if (/LockupNotExpired/i.test(msg)) return '락업이 아직 만료되지 않았습니다. 만료된 락업만 제거할 수 있습니다.';
      if (/LockupExpired/i.test(msg)) return '락업이 이미 만료되었습니다. 만료된 락업은 연장할 수 없습니다.';
      if (/OnlyDecrease/i.test(msg)) return '현재 락업 수량보다 작은 값만 입력 가능합니다.';
      if (/AmountExceedsLocked/i.test(msg)) return '해제할 수량이 현재 락업 수량보다 많습니다.';
      if (/InvalidLockupDuration/i.test(msg)) return '유효하지 않은 락업 시간입니다. 1분 이상이어야 합니다.';
      if (/InsufficientBalance/i.test(msg)) return '잔액이 부족합니다.';
      if (/InvalidAmount/i.test(msg)) return '유효하지 않은 수량입니다.';
      if (/ZeroAddress/i.test(msg)) return '유효하지 않은 주소입니다 (0x0 주소 사용 불가).';
      if (/EnforcedPause/i.test(msg)) return '컨트랙트가 일시정지 상태입니다. 전송이 불가능합니다.';

      return '컨트랙트 호출에 실패했습니다. 입력값과 권한을 확인해주세요.';
    }

    // 잔액 부족
    if (/insufficient funds/i.test(msg) || e?.code === 'INSUFFICIENT_FUNDS') {
      const currency = getNetworkInfo().nativeCurrency;
      return `지갑 잔액(${currency})이 부족합니다. 가스비를 위한 ${currency}가 필요합니다.`;
    }

    // 논스 에러
    if (/nonce too low/i.test(msg)) return '논스가 낮습니다. 지갑을 새로고침하거나 잠시 후 다시 시도해주세요.';
    if (/replacement (fee|underpriced)/i.test(msg)) return '대체 트랜잭션 수수료가 낮습니다. 가스 가격/한도를 높여 재시도하세요.';

    // 가스 추정 실패
    if (e?.code === 'UNPREDICTABLE_GAS_LIMIT' || /gas required exceeds allowance|always failing transaction/i.test(msg)) {
      return '가스 추정에 실패했습니다. 입력값, 권한, 컨트랙트 상태를 확인해주세요.\n\n💡 팁: 락업 관련 함수는 올바른 조건에서만 실행 가능합니다. 입력값이 적절하지 않을 수 있습니다.';
    }

    // 주소/숫자 형식 에러
    if (/invalid address/i.test(msg)) return '잘못된 주소 형식입니다. 0x로 시작하는 42자리 주소를 입력하세요.';
    if (/invalid (bignumber|number|uint)/i.test(msg)) return '숫자 형식이 올바르지 않습니다. 유효한 숫자를 입력하세요.';

    // 네트워크 에러
    if (/network error|chain|wrong network|unsupported chain id/i.test(msg)) return '네트워크 오류입니다. BSC 메인넷(Chain ID: 56)에 연결되어 있는지 확인하세요.';

    return '오류: ' + msg;
  } catch (_) {
    return '알 수 없는 오류가 발생했습니다.';
  }
}

// ====== UI 상태 관리 ======
function updateUIState(isConnected) {
  const buttons = document.querySelectorAll('button:not(.btn-connect-wallet)');
  const links = document.querySelectorAll('.etherscan-links a');
  const body = document.body;

  buttons.forEach(btn => {
    btn.disabled = !isConnected;
    btn.style.cursor = isConnected ? 'pointer' : 'not-allowed';
    btn.style.opacity = isConnected ? '1' : '0.5';

    if (!isConnected) {
      btn.addEventListener('click', preventActionWhenDisconnected, { passive: false });
    } else {
      btn.removeEventListener('click', preventActionWhenDisconnected);
    }
  });

  links.forEach(link => {
    link.style.pointerEvents = isConnected ? 'auto' : 'none';
    link.style.cursor = isConnected ? 'pointer' : 'not-allowed';
    link.style.opacity = isConnected ? '1' : '0.5';

    if (!isConnected) {
      link.addEventListener('click', preventActionWhenDisconnected, { passive: false });
    } else {
      link.removeEventListener('click', preventActionWhenDisconnected);
    }
  });

  if (isConnected) {
    body.classList.remove('wallet-not-connected');
  } else {
    body.classList.add('wallet-not-connected');
  }
}

function preventActionWhenDisconnected(event) {
  event.preventDefault();
  event.stopPropagation();
  alert('지갑을 먼저 연결해주세요.');
  return false;
}

async function ensureConnected() {
  if (!window.ethereum || !ethersProvider || !ethersSigner || !WalletAddress) {
    alert('지갑 연결 먼저 해주세요.');
    throw new Error('WALLET_NOT_CONNECTED');
  }
}

// ====== 초기화 ======
async function initializeWeb3() {
  if (typeof window.ethereum === 'undefined') {
    const device = detectDevice();
    let deviceName = '';

    if (device === 'iOS') {
      deviceName = 'iOS';
    } else if (device === 'Android') {
      deviceName = 'Android';
    } else {
      deviceName = '브라우저';
    }

    const message = device === 'Desktop'
      ? `MetaMask가 설치되지 않았습니다.\n\n확인을 누르면 MetaMask 설치 페이지로 이동합니다.`
      : `MetaMask가 설치되지 않았습니다.\n\n[확인] MetaMask 앱 다운로드 페이지로 이동\n[취소] MetaMask 브라우저에서 열기 시도`;

    const userConfirm = confirm(message);

    if (userConfirm) {
      redirectToMetaMask();
    } else if (device !== 'Desktop') {
      // 모바일에서 취소하면 MetaMask 브라우저로 열기 시도
      openInMetaMaskBrowser();
    }

    return false;
  }

  try {
    web3 = new Web3(window.ethereum);
    ethersProvider = new ethers.providers.Web3Provider(window.ethereum);
    ethersSigner = ethersProvider.getSigner();
    return true;
  } catch (e) {
    console.error('Web3 초기화 실패:', e);
    return false;
  }
}

async function addChainIfNeeded(chainIdHex) {
  if (chainIdHex === '0x38') { // BSC Mainnet
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x38',
          chainName: 'Binance Smart Chain',
          nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com']
        }]
      });
    } catch (e) { console.error(e); }
  }
}

// ====== 네트워크 ======
function setupBscScanLinks() {
  if (!CONTRACT_ADDRESS) return;

  const baseUrl = getExplorerUrl();

  document.getElementById("etherscanContract").href = `${baseUrl}/address/${CONTRACT_ADDRESS}`;
  document.getElementById("etherscanTokenTracker").href = `${baseUrl}/token/${CONTRACT_ADDRESS}`;
  document.getElementById("etherscanHoldAddress").href = `${baseUrl}/token/${CONTRACT_ADDRESS}#balances`;
}

async function checkAndSwitchNetwork() {
  try {
    if (!window.ethereum) {
      console.warn('MetaMask가 설치되지 않음');
      return false;
    }

    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
    const target = '0x38'; // BSC Mainnet

    if (currentChainId !== target) {
      console.log(`현재 네트워크: ${currentChainId}, 목표 네트워크: ${target} - 자동 전환 시도`);

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: target }]
        });
        console.log('✅ BSC 네트워크로 전환 완료');
      } catch (switchError) {
        // 4902: 네트워크가 지갑에 추가되지 않은 경우
        if (switchError.code === 4902) {
          console.log('BSC 네트워크 추가 시도');
          await addChainIfNeeded(target);
          // 추가 후 다시 전환 시도
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: target }]
          });
        } else if (switchError.code === 4001) {
          // 사용자가 거부한 경우
          alert('⚠️ BSC 네트워크로 전환이 필요합니다.\n\n현재 dApp은 Binance Smart Chain에서만 작동합니다.');
          return false;
        } else {
          throw switchError;
        }
      }
    }

    rebuildProviders();
    setupBscScanLinks();
    return true;
  } catch (e) {
    console.error('네트워크 전환 실패:', e);
    alert('네트워크 전환에 실패했습니다.\n\nMetaMask에서 수동으로 BSC 네트워크를 선택해주세요.\n\n' + friendlyError(e));
    return false;
  }
}

async function testContractConnection() {
  if (!WalletAddress || !web3) {
    return true;
  }

  try {
    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    await c.methods.name().call();
    return true;
  } catch (testError) {
    console.warn('컨트랙트 연결 테스트 실패:', testError);

    const errorMessage = testError?.message || String(testError);
    const networkName = getNetworkInfo().chainName;

    if (/Returned values aren't valid|did it run Out of Gas|not using the correct ABI|requesting data from a block number that does not exist|node which is not fully synced/i.test(errorMessage)) {
      alert(`${networkName}에서 컨트랙트를 찾을 수 없습니다.\n\nsmartcontract.js에서 컨트랙트 주소가 올바른지 확인해주세요.\n\n현재 주소: ${CONTRACT_ADDRESS}`);
    } else {
      alert(`${networkName}에서 컨트랙트 연결에 실패했습니다.\n\n오류: ${friendlyError(testError)}`);
    }

    return false;
  }
}

// ====== 지갑 연결 ======
async function connectWallet() {
  const ok = await initializeWeb3();
  if (!ok) {
    console.log('MetaMask 미설치 - 설치 페이지로 리다이렉트');
    return;
  }

  const switched = await checkAndSwitchNetwork();
  if (!switched) return;

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || !accounts.length) {
    alert('지갑 연결 실패');
    return;
  }

  WalletAddress = accounts[0];
  document.getElementById('walletAddress').innerText = WalletAddress;
  updateUIState(true);

  const walletBtn = document.querySelector('.btn-connect-wallet');
  if (walletBtn) {
    walletBtn.innerText = '지갑 새로고침';
    walletBtn.onclick = refreshWallet;
  }

  await updateWalletInfo();
  await loadContractState();
  await Promise.allSettled([checkTokenBalance(), checkWalletRole()]);
}

async function refreshWallet() {
  await connectWallet();
}

async function updateWalletInfo() {
  await Promise.all([checkBNBBalance(), checkTokenBalance(), checkWalletRole()]).catch(() => { });
}

async function checkBNBBalance() {
  try {
    const wei = await web3.eth.getBalance(WalletAddress);
    const bnb = web3.utils.fromWei(wei, 'ether');
    const currency = getNetworkInfo().nativeCurrency;
    document.getElementById('walletBalance').innerText = `${parseFloat(bnb).toFixed(4)} ${currency}`;
  } catch (e) {
    document.getElementById('walletBalance').innerText = '잔액 확인 실패';
  }
}

async function checkTokenBalance() {
  try {
    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const bal = await c.methods.balanceOf(WalletAddress).call();
    const formatted = ethers.utils.formatEther(bal);
    document.getElementById('tokenBalance').innerText = `${parseFloat(formatted).toFixed(2)} HWT`;
  } catch (e) {
    document.getElementById('tokenBalance').innerText = '토큰 잔액 확인 실패';
  }
}

// ====== 권한 체크 ======
async function checkWalletRole() {
  try {
    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const owner = await c.methods.owner().call();
    const isOwner = owner.toLowerCase() === WalletAddress.toLowerCase();

    const el = document.getElementById('walletRole');
    el.className = 'wallet-role';
    if (isOwner) {
      el.innerText = 'OWNER (관리자)';
      el.classList.add('admin');
    } else {
      el.innerText = '일반 사용자';
      el.classList.add('normal');
    }

    updateOwnerControls(isOwner);

  } catch (e) {
    document.getElementById('walletRole').innerText = '권한 확인 실패';
    updateOwnerControls(false);
  }
}

function updateOwnerControls(isOwner) {
  const ownerButtons = document.querySelectorAll('.owner-only');
  ownerButtons.forEach(btn => {
    btn.disabled = !isOwner;
    btn.title = isOwner ? '' : 'Owner 권한이 필요합니다.';
  });
}

// ====== Pause/Unpause ======
async function pauseToken() {
  await ensureConnected();
  try {
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.pause();
    const tx = await c.pause({ gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert('✅ 토큰 일시정지 완료\n\n트랜잭션 해시: ' + tx.hash);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\nBscScan에서 확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await loadContractState();
  } catch (e) {
    console.error('Pause 에러:', e);
    alert(friendlyError(e));
  }
}

async function unpauseToken() {
  await ensureConnected();
  try {
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.unpause();
    const tx = await c.unpause({ gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert('✅ 토큰 정상화 완료\n\n트랜잭션 해시: ' + tx.hash);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\nBscScan에서 확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await loadContractState();
  } catch (e) {
    console.error('Unpause 에러:', e);
    alert(friendlyError(e));
  }
}

// ====== Lockup 관리 ======
async function setLockup() {
  await ensureConnected();
  try {
    const account = document.getElementById('lockupAccount').value.trim();
    const minutes = document.getElementById('lockupMinutes').value;
    const amount = document.getElementById('lockupAmount').value;

    if (!isValidEthereumAddress(account)) throw new Error('주소 형식 오류');
    if (!isValidInteger(minutes, 1)) throw new Error('락업 시간은 1분 이상의 정수여야 합니다');
    if (!isValidAmount(amount, 0)) throw new Error('수량 오류');

    const amountWei = ethers.utils.parseEther(amount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.setLockup(account, minutes, amountWei);
    const tx = await c.setLockup(account, minutes, amountWei, { gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert(`✅ 락업 설정 완료\n\n주소: ${account}\n수량: ${amount} HWT\n시간: ${minutes}분\n\n트랜잭션 해시: ${tx.hash}`);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\nBscScan에서 확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await loadContractState();
  } catch (e) {
    console.error('SetLockup 에러:', e);
    alert(friendlyError(e));
  }
}

async function extendLockup() {
  await ensureConnected();
  try {
    const account = document.getElementById('extendAccount').value.trim();
    const addMinutes = document.getElementById('extendMinutes').value;

    if (!isValidEthereumAddress(account)) throw new Error('주소 형식 오류');
    if (!isValidInteger(addMinutes, 1)) throw new Error('연장 시간은 1분 이상의 정수여야 합니다');

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.extendLockup(account, addMinutes);
    const tx = await c.extendLockup(account, addMinutes, { gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert(`✅ 락업 연장 완료\n\n주소: ${account}\n추가 시간: ${addMinutes}분\n\n트랜잭션 해시: ${tx.hash}`);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\nBscScan에서 확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await loadContractState();
  } catch (e) {
    console.error('ExtendLockup 에러:', e);
    alert(friendlyError(e));
  }
}

async function decreaseLockAmount() {
  await ensureConnected();
  try {
    const account = document.getElementById('decreaseAccount').value.trim();
    const newAmount = document.getElementById('decreaseAmount').value;

    if (!isValidEthereumAddress(account)) throw new Error('주소 형식 오류');
    if (!isValidAmount(newAmount, 0)) throw new Error('수량 오류');

    const amountWei = ethers.utils.parseEther(newAmount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.decreaseLockAmount(account, amountWei);
    const tx = await c.decreaseLockAmount(account, amountWei, { gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert(`✅ 락업 수량 감소 완료\n\n주소: ${account}\n새로운 락업 수량: ${newAmount} HWT\n\n⚠️ 주의: 기존 수량에서 빼는 것이 아니라 새 수량으로 교체되었습니다!\n\n트랜잭션 해시: ${tx.hash}`);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\nBscScan에서 확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await loadContractState();
  } catch (e) {
    console.error('DecreaseLockAmount 에러:', e);
    alert(friendlyError(e));
  }
}

async function releaseLockup() {
  await ensureConnected();
  try {
    const account = document.getElementById('releaseAccount').value.trim();
    const amount = document.getElementById('releaseAmount').value;

    if (!isValidEthereumAddress(account)) throw new Error('주소 형식 오류');
    if (!isValidAmount(amount, 0)) throw new Error('수량 오류');

    const amountWei = ethers.utils.parseEther(amount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.releaseLockup(account, amountWei);
    const tx = await c.releaseLockup(account, amountWei, { gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert(`✅ 락업 부분 해제 완료\n\n주소: ${account}\n해제된 수량: ${amount} HWT\n\n✅ 입력한 수량만큼 기존 락업에서 차감되었습니다!\n\n트랜잭션 해시: ${tx.hash}`);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\nBscScan에서 확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await loadContractState();
  } catch (e) {
    console.error('ReleaseLockup 에러:', e);
    alert(friendlyError(e));
  }
}

async function clearExpiredLockup() {
  await ensureConnected();
  try {
    const account = document.getElementById('clearAccount').value.trim();

    if (!isValidEthereumAddress(account)) throw new Error('주소 형식 오류');

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.clearExpiredLockup(account);
    const tx = await c.clearExpiredLockup(account, { gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert(`✅ 만료된 락업 제거 완료\n\n주소: ${account}\n\n컨트랙트 저장소에서 깔끔하게 정리되었습니다.\n이 작업은 필수가 아니며 가스비 절약을 위한 선택사항입니다.\n\n트랜잭션 해시: ${tx.hash}`);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\n영수증 확인에 실패했지만 트랜잭션은 블록체인에 전송되었습니다.\nBscScan에서 확인해주세요: ${explorerUrl}/tx/${tx.hash}`);
    }

    await loadContractState();
  } catch (e) {
    console.error('ClearExpiredLockup 에러:', e);
    alert(friendlyError(e));
  }
}

// ====== Lockup 조회 ======
async function checkLockupInfo() {
  try {
    const account = document.getElementById('checkLockupAccount').value.trim();
    if (!isValidEthereumAddress(account)) throw new Error('주소 형식 오류');

    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const info = await c.methods.lockedInfo(account).call();

    const locked = ethers.utils.formatEther(info.locked);
    const remainingSec = Number(info.remainingSeconds);
    const expiration = Number(info.expiration);

    if (Number(locked) === 0 || remainingSec === 0) {
      document.getElementById('lockupInfoResult').innerText = '❌ 아직 락업 상태가 아닙니다.';
      document.getElementById('lockupInfoResult').style.borderColor = '#888';
      return;
    }

    const expirationDate = new Date(expiration * 1000);
    const now = new Date();

    const days = Math.floor(remainingSec / 86400);
    const hours = Math.floor((remainingSec % 86400) / 3600);
    const minutes = Math.floor((remainingSec % 3600) / 60);
    const seconds = remainingSec % 60;

    let timeStr = '';
    if (days > 0) timeStr += `${days}일 `;
    if (hours > 0) timeStr += `${hours}시간 `;
    if (minutes > 0) timeStr += `${minutes}분 `;
    timeStr += `${seconds}초`;

    document.getElementById('lockupInfoResult').innerText =
      `✅ 락업 정보\n\n` +
      `🔒 락업 수량: ${locked} HWT\n` +
      `⏱ 남은 시간: ${timeStr} (총 ${remainingSec.toLocaleString()}초)\n` +
      `📅 만료 일시: ${expirationDate.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })}\n` +
      `🌐 현재 시간: ${now.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })}`;

    document.getElementById('lockupInfoResult').style.borderColor = '#00ffcc';
  } catch (e) {
    document.getElementById('lockupInfoResult').innerText = '조회 실패: ' + e.message;
    document.getElementById('lockupInfoResult').style.borderColor = '#ff6b6b';
  }
}

async function checkUnlockedBalance() {
  try {
    const account = document.getElementById('checkUnlockedAccount').value.trim();
    if (!isValidEthereumAddress(account)) throw new Error('주소 형식 오류');

    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const unlocked = await c.methods.unlockedBalanceOf(account).call();
    const total = await c.methods.balanceOf(account).call();
    const locked = await c.methods.lockedBalance(account).call();

    const unlockedFormatted = ethers.utils.formatEther(unlocked);
    const totalFormatted = ethers.utils.formatEther(total);
    const lockedFormatted = ethers.utils.formatEther(locked);

    document.getElementById('unlockedBalanceResult').innerText =
      `✅ 잔액 정보\n\n` +
      `💰 전체 보유: ${totalFormatted} HWT\n` +
      `🔒 락업 중: ${lockedFormatted} HWT\n` +
      `✅ 사용 가능: ${unlockedFormatted} HWT`;

    document.getElementById('unlockedBalanceResult').style.borderColor = '#00ffcc';
  } catch (e) {
    document.getElementById('unlockedBalanceResult').innerText = '조회 실패: ' + e.message;
    document.getElementById('unlockedBalanceResult').style.borderColor = '#ff6b6b';
  }
}

// ====== 토큰 전송 ======
async function transferToken() {
  await ensureConnected();
  try {
    const to = document.getElementById('transferTo').value.trim();
    const amount = document.getElementById('transferAmount').value;

    if (!isValidEthereumAddress(to)) throw new Error('주소 형식 오류');
    if (!isValidAmount(amount, 0)) throw new Error('수량 오류');

    const amountWei = ethers.utils.parseEther(amount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.transfer(to, amountWei);
    const tx = await c.transfer(to, amountWei, { gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert(`✅ 전송 완료!\n\n받는 주소: ${to}\n전송 수량: ${amount} HWT\n\n트랜잭션 해시: ${tx.hash}`);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\nBscScan에서 확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await updateWalletInfo();
  } catch (e) {
    console.error('Transfer 에러:', e);
    alert(friendlyError(e));
  }
}

// ====== 토큰 소각 ======
async function burnToken() {
  await ensureConnected();
  try {
    const amount = document.getElementById('burnAmount').value;

    if (!isValidAmount(amount, 0)) throw new Error('수량 오류');

    const amountWei = ethers.utils.parseEther(amount.toString());

    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const gas = await c.estimateGas.burn(amountWei);
    const tx = await c.burn(amountWei, { gasLimit: gas.mul(120).div(100) });

    console.log('트랜잭션 전송됨:', tx.hash);

    const explorerUrl = getExplorerUrl();

    try {
      const receipt = await tx.wait();
      console.log('트랜잭션 성공:', receipt);
      alert(`✅ 소각 완료!\n\n소각된 수량: ${amount} HWT\n\n⚠️ 이 토큰은 영구적으로 제거되었으며 복구할 수 없습니다.\n총 공급량도 함께 감소했습니다.\n\n트랜잭션 해시: ${tx.hash}`);
    } catch (waitError) {
      console.warn('영수증 대기 중 에러 (트랜잭션은 전송됨):', waitError);
      alert(`⚠️ 트랜잭션이 전송되었습니다\n\n트랜잭션 해시: ${tx.hash}\n\nBscScan에서 확인: ${explorerUrl}/tx/${tx.hash}`);
    }

    await updateWalletInfo();
    await loadContractState();
  } catch (e) {
    console.error('Burn 에러:', e);
    alert(friendlyError(e));
  }
}

// ====== 토큰 정보 조회 ======
async function checkBalance() {
  try {
    const account = document.getElementById('checkBalanceAccount').value.trim();
    if (!isValidEthereumAddress(account)) throw new Error('주소 형식 오류');

    const c = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    const bal = await c.methods.balanceOf(account).call();
    const formatted = ethers.utils.formatEther(bal);

    document.getElementById('balanceResult').innerText =
      `💰 전체 잔액: ${formatted} HWT\n\n` +
      `💡 이 중 일부는 락업되어 있을 수 있습니다.\n` +
      `   사용 가능 잔액은 "사용 가능 잔액 확인"에서 조회하세요.`;

    document.getElementById('balanceResult').style.borderColor = '#00ffcc';
  } catch (e) {
    document.getElementById('balanceResult').innerText = '조회 실패: ' + e.message;
    document.getElementById('balanceResult').style.borderColor = '#ff6b6b';
  }
}

// ====== 컨트랙트 상태 조회 ======
async function loadContractState() {
  if (!WalletAddress || !ethersSigner) {
    return;
  }

  try {
    const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, ethersSigner);
    const wc = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

    const [
      name, symbol, decimals, totalSupply, paused, owner
    ] = await Promise.all([
      c.name(),
      c.symbol(),
      c.decimals(),
      wc.methods.totalSupply().call(),
      c.paused(),
      c.owner()
    ]);

    setText('st_name', name);
    setText('st_symbol', symbol);
    setText('st_decimals', decimals.toString());
    setText('st_totalSupply', ethers.utils.formatEther(totalSupply) + ' HWT');
    setText('st_paused', paused ? '일시정지 상태' : '정상');
    setText('st_owner', owner);

  } catch (e) {
    console.error('컨트랙트 상태 조회 오류:', e);

    const errorMessage = e?.message || String(e);
    const networkName = getNetworkInfo().chainName;

    if (/Returned values aren't valid|did it run Out of Gas|not using the correct ABI|requesting data from a block number that does not exist|node which is not fully synced/i.test(errorMessage)) {
      alert(`${networkName}에서 컨트랙트를 찾을 수 없습니다.\n\nsmartcontract.js에서 컨트랙트 주소를 확인해주세요.\n\n현재 주소: ${CONTRACT_ADDRESS}`);
    } else {
      alert(friendlyError(e));
    }
  }
}

// ====== 초기 DOM 세팅 ======
document.addEventListener('DOMContentLoaded', async () => {
  // MetaMask 설치 여부 체크 (자동 리다이렉트는 하지 않음)
  if (typeof window.ethereum === 'undefined') {
    const device = detectDevice();
    console.log(`MetaMask 미설치 감지 (${device})`);

    // UI에 경고 메시지 표시
    const walletSection = document.querySelector('.wallet-section');
    if (walletSection) {
      const warningDiv = document.createElement('div');
      warningDiv.style.cssText = `
        background: rgba(255,107,107,0.1);
        border: 2px solid #ff6b6b;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
        text-align: center;
      `;

      let buttonText = '';
      let buttonIcon = '';

      if (device === 'iOS') {
        buttonText = 'App Store에서 MetaMask 다운로드';
        buttonIcon = '📱';
      } else if (device === 'Android') {
        buttonText = 'Play Store에서 MetaMask 다운로드';
        buttonIcon = '📱';
      } else {
        buttonText = 'MetaMask 설치하기';
        buttonIcon = '🦊';
      }

      warningDiv.innerHTML = `
        <h3 style="color:#ff6b6b;margin:0 0 10px 0;">⚠️ MetaMask가 설치되지 않았습니다</h3>
        <p style="margin:10px 0;">이 dApp을 사용하려면 MetaMask가 필요합니다.</p>
        <button 
          onclick="redirectToMetaMask()" 
          style="
            background: linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin: 5px;
          "
        >
          ${buttonIcon} ${buttonText}
        </button>
        ${device !== 'Desktop' ? `
          <button 
            onclick="openInMetaMaskBrowser()" 
            style="
              background: #00d395;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              margin: 5px;
            "
          >
            🌐 MetaMask 브라우저로 열기
          </button>
        ` : ''}
      `;

      walletSection.insertBefore(warningDiv, walletSection.firstChild);
    }
  }
  
  updateUIState(false);

  // 페이지 로드 시 네트워크 체크
  if (window.ethereum) {
    try {
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (currentChainId !== '0x38') {
        console.log('⚠️ BSC 네트워크가 아님 - 자동 전환 시도');
        const switched = await checkAndSwitchNetwork();
        if (switched) {
          console.log('✅ BSC로 자동 전환 완료');
        }
      }
    } catch (e) {
      console.warn('초기 네트워크 체크 실패:', e);
    }

    // 네트워크 변경 감지 리스너 추가
    window.ethereum.on('chainChanged', async (chainId) => {
      console.log('네트워크 변경 감지:', chainId);

      if (chainId !== '0x38') {
        alert('⚠️ 네트워크가 변경되었습니다.\n\nBSC 네트워크로 자동 전환합니다.');
        const switched = await checkAndSwitchNetwork();

        if (switched && WalletAddress) {
          // 네트워크 전환 후 상태 새로고침
          await updateWalletInfo();
          await loadContractState();
        }
      } else {
        console.log('✅ BSC 네트워크로 변경됨');

        // BSC로 변경된 경우 페이지 새로고침
        if (WalletAddress) {
          rebuildProviders();
          await updateWalletInfo();
          await loadContractState();
        }
      }
    });

    // 계정 변경 감지 리스너 추가
    window.ethereum.on('accountsChanged', async (accounts) => {
      console.log('계정 변경 감지:', accounts);

      if (accounts.length === 0) {
        // 연결 해제됨
        console.log('지갑 연결 해제됨');
        WalletAddress = "";
        document.getElementById('walletAddress').innerText = '연결되지 않음';
        updateUIState(false);

        const walletBtn = document.querySelector('.btn-connect-wallet');
        if (walletBtn) {
          walletBtn.innerText = '🔗 지갑 연결 (MetaMask / Trust Wallet)';
          walletBtn.onclick = connectWallet;
        }
      } else if (accounts[0] !== WalletAddress) {
        // 계정 변경됨
        console.log('계정 변경됨:', accounts[0]);
        WalletAddress = accounts[0];
        document.getElementById('walletAddress').innerText = WalletAddress;

        // 네트워크 확인
        const switched = await checkAndSwitchNetwork();
        if (switched) {
          await updateWalletInfo();
          await loadContractState();
        }
      }
    });
  }
});

const TOKEN_META = {
  address: typeof CONTRACT_ADDRESS !== 'undefined' ? CONTRACT_ADDRESS : '',
  symbol: 'HWT',
  decimals: 18,
  image: null
};

function resolveTokenLogo() {
  try {
    const candidates = ['logo.png', 'img/logo.png', 'assets/logo.png', 'logo.webp', 'img/logo.webp'];
    for (const c of candidates) {
      return new URL(c, window.location.href).toString();
    }
  } catch (_) {}
  return null;
}

async function addCustomToken() {
  try {
    if (!TOKEN_META.address || !/^0x[a-fA-F0-9]{40}$/.test(TOKEN_META.address)) {
      alert('토큰 컨트랙트 주소가 올바르지 않습니다. smartcontract.js의 CONTRACT_ADDRESS를 확인하세요.');
      return;
    }
    TOKEN_META.image = resolveTokenLogo();

    if (typeof window.ethereum === 'undefined') {
      openInMetaMaskBrowser(); // 모바일 딥링크 → 앱/스토어 유도
      return;
    }

    const ok = await checkAndSwitchNetwork(); // BSC로 전환/추가
    if (!ok) return;

    const wasAdded = await window.ethereum.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: TOKEN_META.address,
          symbol: TOKEN_META.symbol,
          decimals: TOKEN_META.decimals,
          image: TOKEN_META.image || undefined
        }
      }
    });

    alert(wasAdded ? `✅ ${TOKEN_META.symbol} 토큰이 추가되었습니다.` : `ℹ️ 사용자가 추가를 취소했습니다.`);
  } catch (e) {
    const msg = e?.message || String(e);
    if (/unsupported|not supported|unrecognized|does not exist/i.test(msg)) {
      alert([
        '⚠️ 현재 사용 중인 지갑이 자동 추가를 지원하지 않습니다.',
        `1) 지갑에서 "토큰 가져오기" 선택`,
        `2) 주소: ${TOKEN_META.address}`,
        `3) 심볼: ${TOKEN_META.symbol}, 소수점: ${TOKEN_META.decimals}`,
        TOKEN_META.image ? `4) 로고 URL: ${TOKEN_META.image}` : null
      ].filter(Boolean).join('\n'));
      return;
    }
    alert('토큰 추가 중 오류가 발생했습니다.\n\n' + friendlyError(e));
  }
}

import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 설정 및 초기화
const RAW_KEY = "AIzaSyAGUsEQ2zXlX_mLfdf9eQbnJbiZLcEBkE8"; // 여기에 키를 입력하세요.
const API_KEY = RAW_KEY.replace(/[^a-zA-Z0-9_-]/g, "");

// 전역 변수로 선언만 해둡니다.
const genAI = new GoogleGenerativeAI(API_KEY);

let gameState = {
    location: 'west',
    level: 1,
    exp: 0,
    money: 1000,
    day: 1,
    intimacy: 0,
    inventory: [],
    dailyItems: [],
    hasQueenGem: false
};

// 2. NPC 페르소나 설정
const personas = {
    west: () => `너는 17세 여고생 '유나'야. 쌀쌀맞고 반항적이지만 사실 여린 아이야. 현재 친밀도는 ${gameState.intimacy}%야. 반말로 짧게 대답해.`,
    east: () => `너는 신비로운 '골동품점 할아버지'야. 인자한 말투를 써. 플레이어의 고고학 레벨은 ${gameState.level}이야.`
};

// 3. 게임 엔진 함수
async function handleCommand(cmd) {
    if (!cmd) return;
    addLog("나", cmd, "my-msg");
    const lowerCmd = cmd.toLowerCase();

    if (lowerCmd === "오른쪽" || lowerCmd === "east" || lowerCmd === "동쪽") {
        gameState.location = 'east';
        addLog("시스템", "잡화점으로 이동했습니다. 할아버지가 인사를 건넵니다.", "system-msg");
        showShopList();
    } 
    else if (lowerCmd === "왼쪽" || lowerCmd === "west" || lowerCmd === "서쪽") {
        gameState.location = 'west';
        addLog("시스템", "유나의 방으로 돌아왔습니다.", "system-msg");
    } 
    else if (lowerCmd.startsWith("구매")) {
        const idx = parseInt(lowerCmd.replace("구매", "").trim()) - 1;
        buyItem(idx);
    } 
    else if (lowerCmd === "감정") {
        if (gameState.inventory.length > 0) appraiseItem(0);
        else addLog("시스템", "감정할 물건이 없습니다.", "system-msg");
    } 
    else {
        await callGeminiAI(cmd);
    }
    updateUI();
}

// 4. Gemini AI 통신 (404 방지 최적화 버전)
async function callGeminiAI(userText) {
    const npcName = gameState.location === 'west' ? "유나" : "할아버지";
    const colorClass = gameState.location === 'west' ? "npc-girl" : "npc-elder";

    try {
        if (!genAI) {
            genAI = new GoogleGenerativeAI(API_KEY);
        }

        // [중요] 404를 피하기 위해 가장 호환성이 높은 모델명 형식을 사용합니다.
        // models/ 를 명시적으로 붙여주는 것이 v1beta 버전에서는 필수입니다.
        const model = genAI.getGenerativeModel({ 
            model: "models/gemini-1.5-flash",
            systemInstruction: personas[gameState.location]()
        });

        // 채팅 세션 구조를 명확히 하여 요청 주소 오류를 방지합니다.
        const chatSession = model.startChat({
            history: [],
            generationConfig: {
                maxOutputTokens: 200,
            },
        });

        const result = await chatSession.sendMessage(userText);
        const response = await result.response;
        const reply = response.text();

        addLog(npcName, reply, colorClass);

        if (gameState.location === 'west') {
            gameState.intimacy = Math.min(100, gameState.intimacy + 1);
        }
    } catch (e) {
        console.error("상세 에러 로그:", e);
        // 에러가 계속되면 모델명을 "gemini-1.5-flash" (models/ 제외)로 바꿔보라는 안내
        addLog("시스템", "연결 실패. 모델명을 다시 조정합니다...", "system-msg");
        
        // 자동 재시도 로직 (models/ 유무 차이 극복)
        if (e.message.includes("404") || e.message.includes("not found")) {
             addLog("시스템", "팁: 모델명에서 'models/'를 빼거나 넣어보며 테스트 중입니다.", "system-msg");
        }
    }
}

// 5. 유틸리티 함수 (동일)
function addLog(sender, msg, className) {
    const logContainer = document.getElementById('chat-log');
    const div = document.createElement('div');
    div.style.marginBottom = "5px";
    div.innerHTML = `<span class="${className}">[${sender}]</span> ${msg}`;
    logContainer.appendChild(div);
    const panel = document.getElementById('log-panel');
    panel.scrollTop = panel.scrollHeight;
}

function updateUI() {
    document.getElementById('stat-loc').innerText = gameState.location === 'west' ? "서쪽 방(유나)" : "동쪽 방(잡화점)";
    document.getElementById('stat-level').innerText = gameState.level;
    document.getElementById('stat-money').innerText = gameState.money.toLocaleString();
    document.getElementById('stat-time').innerText = `${gameState.day}일차`;
    document.getElementById('stat-intimacy').innerText = gameState.intimacy;
    const itemsEl = document.getElementById('items');
    itemsEl.innerHTML = gameState.inventory.map(i => `<li>${i.name}</li>`).join('');
}

function refreshShop() {
    gameState.dailyItems = [
        { name: "먼지 쌓인 병", cost: 100, realValue: 500 },
        { name: "녹슨 칼", cost: 300, realValue: 1500 },
        { name: "금이 간 도자기", cost: 500, realValue: 5000 }
    ].sort(() => Math.random() - 0.5);
}

function showShopList() {
    let msg = "판매 중: " + gameState.dailyItems.map((item, i) => `[${i+1}] ${item.name}(${item.cost}원)`).join(", ");
    addLog("할아버지", msg, "npc-elder");
}

function buyItem(idx) {
    const item = gameState.dailyItems[idx];
    if (item && gameState.money >= item.cost) {
        gameState.money -= item.cost;
        gameState.inventory.push(item);
        addLog("시스템", `'${item.name}' 구매 완료.`, "system-msg");
    } else {
        addLog("시스템", "구매할 수 없습니다.", "system-msg");
    }
}

function appraiseItem(idx) {
    const item = gameState.inventory[idx];
    const isSuccess = Math.random() * 100 < (gameState.level * 15);
    if (isSuccess) {
        addLog("시스템", `감정 성공! ${item.realValue}원에 판매했습니다.`, "system-msg");
        gameState.money += item.realValue;
        gameState.exp += 30;
    } else {
        addLog("시스템", "감정 실패. 헐값에 처분했습니다.", "system-msg");
        gameState.money += 20;
    }
    gameState.inventory.splice(idx, 1);
    if (gameState.exp >= gameState.level * 100) {
        gameState.level++;
        gameState.exp = 0;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const inputEl = document.getElementById('user-input');
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = inputEl.value.trim();
            handleCommand(cmd);
            inputEl.value = '';
        }
    });
    refreshShop();
    updateUI();
});









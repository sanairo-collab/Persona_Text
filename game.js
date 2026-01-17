import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 설정 및 초기화
const API_KEY = "AIzaSyAGUsEQ2zXlX_mLfdf9eQbnJbiZLcEBkE8"; 
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

// 3. 게임 엔진 함수 (명령어 처리)
async function handleCommand(cmd) {
    if (!cmd) return;
    addLog("나", cmd, "my-msg");

    const lowerCmd = cmd.toLowerCase();

    // 이동 로직
    if (lowerCmd === "오른쪽" || lowerCmd === "east" || lowerCmd === "동쪽") {
        gameState.location = 'east';
        addLog("시스템", "잡화점으로 이동했습니다. 할아버지가 인사를 건넵니다.", "system-msg");
        showShopList();
    } 
    else if (lowerCmd === "왼쪽" || lowerCmd === "west" || lowerCmd === "서쪽") {
        gameState.location = 'west';
        addLog("시스템", "유나의 방으로 돌아왔습니다.", "system-msg");
    } 
    // 구매 로직
    else if (lowerCmd.startsWith("구매")) {
        const idx = parseInt(lowerCmd.replace("구매", "").trim()) - 1;
        buyItem(idx);
    } 
    // 감정 로직
    else if (lowerCmd === "감정") {
        if (gameState.inventory.length > 0) appraiseItem(0);
        else addLog("시스템", "감정할 물건이 없습니다.", "system-msg");
    } 
    // 대화 로직 (AI 호출)
    else {
        await callGeminiAI(cmd);
    }
    updateUI();
}

// 4. Gemini AI 통신
async function callGeminiAI(userText) {
    const npcName = gameState.location === 'west' ? "유나" : "할아버지";
    const colorClass = gameState.location === 'west' ? "npc-girl" : "npc-elder";

    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: personas[gameState.location]()
        });

        const result = await model.generateContent(userText);
        const reply = result.response.text();

        addLog(npcName, reply, colorClass);

        if (gameState.location === 'west') {
            gameState.intimacy = Math.min(100, gameState.intimacy + 1);
            if (gameState.intimacy >= 100 && gameState.level >= 10 && !gameState.hasQueenGem) {
                if (reply.includes("보석") || reply.includes("감정")) {
                    gameState.hasQueenGem = true;
                    addLog("시스템", "유나가 낡은 보석을 건넸습니다...!", "system-msg");
                }
            }
        }
    } catch (e) {
        console.error(e);
        addLog("시스템", "AI 응답 오류: API 키나 인터넷 연결을 확인하세요.", "system-msg");
    }
}

// 5. 유틸리티 함수 (로그 및 UI)
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

// 6. 이벤트 리스너 (DOMContentLoaded로 감싸서 안전하게 실행)
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
    console.log("게임이 준비되었습니다.");

});

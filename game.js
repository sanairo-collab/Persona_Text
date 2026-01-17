import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 보안 및 초기 설정 (기존과 동일)
let API_KEY = localStorage.getItem("gemini_api_key");
if (!API_KEY) {
    const inputKey = prompt("Gemini API 키를 입력해주세요.");
    if (inputKey) {
        API_KEY = inputKey.trim();
        localStorage.setItem("gemini_api_key", API_KEY);
    }
}

let genAI = null;
if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
}

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

// 2. 장소 묘사 및 도움말 추가
const locations = {
    west: {
        name: "서쪽 발굴지 (유나의 텐트)",
        description: `낡은 방수포가 펄럭이는 소리가 들립니다. 텐트 중앙에는 각종 유물이 어지럽게 놓인 '낡은 책상'이 있습니다. 유나가 여기서 감정 작업을 도와주는 모양입니다.`,
        help: "💡 [명령어: '감정 1', '책상', '대화'] (높은 등급 감정은 친밀도가 필요해!)"
    },
    east: {
        name: "동쪽 길목 (잡화점)",
        description: `오래된 나무 향이 가득합니다. 할아버지가 카운터에서 물건을 진열하고 있습니다. 여기서 물건을 사거나, 감정된 유물을 팔 수 있습니다.`,
        help: "💡 [명령어: '구매 1', '판매 1', '이동']"
    }
};

const personas = {
    west: () => `너는 17세 고고학도 '유나'야. 플레이어 '고'에게 쌀쌀맞은 반말을 써. 친밀도(${gameState.intimacy}%)에 따라 말투가 아주 조금씩 부드러워져. 1~2문장으로 짧게 답해.`,
    east: () => `너는 인자한 잡화점 할아버지야. '고'가 가져온 유물을 매입하거나 새 물건을 팔아. 인자하게 한 문장으로만 말해.`
};

// 3. UI 업데이트
function updateUI() {
    const loc = locations[gameState.location];
    document.getElementById('stat-loc').innerText = loc.name;
    document.getElementById('stat-level').innerText = gameState.level;
    document.getElementById('stat-money').innerText = gameState.money.toLocaleString();
    document.getElementById('stat-time').innerText = `${gameState.day}일차`;
    document.getElementById('stat-intimacy').innerText = gameState.intimacy;
    
    const itemsEl = document.getElementById('items');
    itemsEl.innerHTML = gameState.inventory.map((i, idx) => 
        `<li>[${idx+1}] ${i.name} ${i.isAppraised ? '(감정완료)' : '(미감정)'}</li>`
    ).join('');
}

// 4. 핵심 명령어 처리
async function handleCommand(cmd) {
    if (!cmd) return;
    addLog("나", cmd, "my-msg");
    const lowerCmd = cmd.toLowerCase();

    // 이동
    if (lowerCmd.includes("동쪽") || lowerCmd.includes("오른쪽")) {
        gameState.location = 'east';
        updateStatus();
        showShopList();
        return;
    }
    if (lowerCmd.includes("서쪽") || lowerCmd.includes("왼쪽")) {
        gameState.location = 'west';
        updateStatus();
        return;
    }

    // 구매 (동쪽)
    if (gameState.location === 'east' && (lowerCmd.includes("구매") || lowerCmd.includes("사기"))) {
        const idx = parseInt(lowerCmd.replace(/[^0-9]/g, "")) - 1;
        buyItem(idx);
        return;
    }

    // 판매 (동쪽)
    if (gameState.location === 'east' && (lowerCmd.includes("판매") || lowerCmd.includes("팔기"))) {
        const idx = parseInt(lowerCmd.replace(/[^0-9]/g, "")) - 1;
        sellItem(idx);
        return;
    }

    // 감정 (서쪽, 책상)
    if (gameState.location === 'west' && (lowerCmd.includes("감정") || lowerCmd.includes("책상"))) {
        const idx = parseInt(lowerCmd.replace(/[^0-9]/g, "")) - 1 || 0;
        await appraiseAtDesk(idx);
        return;
    }

    await callGeminiAI(cmd);
    updateUI();
}

function updateStatus() {
    const loc = locations[gameState.location];
    addLog("시스템", "--------------------------------", "system-msg");
    addLog("시스템", loc.description, "system-msg");
    addLog("시스템", loc.help, "system-msg");
    updateUI();
}

// 5. 게임 기능 로직
async function appraiseAtDesk(idx) {
    const item = gameState.inventory[idx];
    if (!item) {
        addLog("시스템", "감정할 물건이 없어.", "system-msg");
        return;
    }
    if (item.isAppraised) {
        addLog("유나", "이미 감정 끝난 거야. 할아버지한테나 가봐.", "npc-girl");
        return;
    }

    // 등급별 친밀도 체크
    let requiredIntimacy = 0;
    if (item.grade > 80) requiredIntimacy = 50;
    else if (item.grade > 50) requiredIntimacy = 20;

    if (gameState.intimacy < requiredIntimacy) {
        addLog("유나", `이건 너무 정교해서 지금의 너랑은 분석하기 싫어. 나랑 더 친해지든가. (필요 친밀도: ${requiredIntimacy})`, "npc-girl");
        return;
    }

    // AI 감정 대사 (반말 페르소나 적용)
    const prompt = `너는 고고학도 유나야. 플레이어 '고'가 가져온 '${item.name}'(등급:${item.grade}/100)을 책상에서 감정하고 있어. 
                   결과에 대해 쌀쌀맞은 반말로 한 문장만 말해줘. 
                   등급이 높으면 조금 놀란 척을 하고, 낮으면 한심해해.`;
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
        const result = await model.generateContent(prompt);
        const yunaReply = result.response.text().trim();

        item.isAppraised = true; // 감정 완료 상태로 변경
        // 등급에 따른 판매 가격 책정 (감정 완료 시점에 고정)
        item.value = Math.floor(item.grade * 15 * (1 + gameState.level * 0.1)); 

        addLog("유나", yunaReply, "npc-girl");
        addLog("시스템", `[감정완료] '${item.name}'의 가치를 파악했다! 할아버지에게 팔 수 있어.`, "system-msg");
        gameState.exp += 20;
    } catch (e) {
        addLog("시스템", "감정 장비가 고장 났나 봐(AI 오류).", "system-msg");
    }
    updateUI();
}

function sellItem(idx) {
    const item = gameState.inventory[idx];
    if (!item) {
        addLog("할아버지", "팔 물건이 없구려.", "npc-elder");
        return;
    }
    if (!item.isAppraised) {
        addLog("할아버지", "유나 양에게 가서 감정을 먼저 받아오게나. 뭔지 알아야 사지.", "npc-elder");
        return;
    }

    gameState.money += item.value;
    addLog("시스템", `'${item.name}'을 ${item.value}원에 판매했습니다.`, "system-msg");
    gameState.inventory.splice(idx, 1);
    updateUI();
}

async function refreshShop() {
    const newItems = [];
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    for (let i = 0; i < 3; i++) {
        const prompt = "낡은 유물 이름을 5자 이내로 하나 지어줘. 예: 깨진 청자.";
        const result = await model.generateContent(prompt);
        newItems.push({ 
            name: result.response.text().trim(), 
            cost: 200, 
            grade: Math.floor(Math.random() * 100) + 1,
            isAppraised: false 
        });
    }
    gameState.dailyItems = newItems;
}

function showShopList() {
    let msg = "판매 목록: " + gameState.dailyItems.map((item, i) => `[${i+1}] ${item.name}(${item.cost}원)`).join(", ");
    addLog("할아버지", msg, "npc-elder");
}

function buyItem(idx) {
    const item = gameState.dailyItems[idx];
    if (item && gameState.money >= item.cost) {
        gameState.money -= item.cost;
        gameState.inventory.push({...item});
        addLog("시스템", `'${item.name}' 구매! 유나의 책상으로 가자.`, "system-msg");
    } else {
        addLog("할아버지", "돈이 모자라구먼.", "npc-elder");
    }
    updateUI();
}

async function callGeminiAI(userText) {
    const npcName = gameState.location === 'west' ? "유나" : "할아버지";
    const colorClass = gameState.location === 'west' ? "npc-girl" : "npc-elder";
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-flash-lite-latest",
            systemInstruction: personas[gameState.location]()
        });
        const result = await model.generateContent(userText);
        addLog(npcName, result.response.text(), colorClass);
        if (gameState.location === 'west') gameState.intimacy = Math.min(100, gameState.intimacy + 1);
    } catch (e) {
        addLog("시스템", "AI 통신 오류.", "system-msg");
    }
}

function addLog(sender, msg, className) {
    const logContainer = document.getElementById('chat-log');
    const div = document.createElement('div');
    div.innerHTML = `<span class="${className}">[${sender}]</span> ${msg}`;
    logContainer.appendChild(div);
    const panel = document.getElementById('log-panel');
    panel.scrollTop = panel.scrollHeight;
}

document.addEventListener('DOMContentLoaded', () => {
    const inputEl = document.getElementById('user-input');
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleCommand(inputEl.value.trim());
            inputEl.value = '';
        }
    });
    refreshShop();
    updateUI();
});

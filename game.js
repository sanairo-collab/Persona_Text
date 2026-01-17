import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 보안 및 초기 설정
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

// 2. 장소 묘사 및 도움말
const locations = {
    west: {
        name: "서쪽 발굴지 (유나의 텐트)",
        description: `낡은 방수포가 펄럭이는 소리가 들립니다. 텐트 중앙에는 각종 유물이 어지럽게 놓인 '낡은 책상'이 있습니다.`,
        help: "💡 [명령어: '감정 1', '책상', '대화'] (고등급 감정은 친밀도 필요!)"
    },
    east: {
        name: "동쪽 길목 (잡화점)",
        description: `오래된 나무 향이 가득합니다. 할아버지가 카운터에서 물건을 진열하고 있습니다.`,
        help: "💡 [명령어: '구매 1', '판매 1', '이동'] (감정된 것만 판매 가능!)"
    }
};

const personas = {
    west: () => `너는 17세 고고학도 '유나'야. 플레이어 '고'에게 쌀쌀맞은 반말을 써. 친밀도(${gameState.intimacy}%)에 따라 말투가 변해. 짧게 답해.`,
    east: () => `너는 인자한 잡화점 할아버지야. 인자하게 한 문장으로만 말해.`
};

// 3. 밸런스 핵심 함수: 확률 가중치 등급 생성
function generateWeightedGrade() {
    const rand = Math.random();
    if (rand < 0.50) return Math.floor(Math.random() * 50) + 1;       // 1~50 등급 (50% 확률)
    if (rand < 0.85) return Math.floor(Math.random() * 30) + 51;      // 51~80 등급 (35% 확률)
    if (rand < 0.97) return Math.floor(Math.random() * 14) + 81;      // 81~94 등급 (12% 확률)
    return Math.floor(Math.random() * 6) + 95;                       // 95~100 등급 (3% 확률 - 대박)
}

// 4. 밸런스 핵심 함수: 등급별 가치 계산
function calculateValue(grade) {
    if (grade <= 5) return 0;           // 최저 등급
    if (grade >= 95) return 100000000;  // 최고 등급 (1억원)
    
    const baseCost = 200;
    if (grade <= 50) {
        // 1~50: 구매가(200)보다 낮게 (10~190원)
        return Math.floor((grade / 50) * (baseCost - 10)) + 10;
    } else {
        // 51~94: 구매가(200)보다 높게 등비급수적 증가
        return Math.floor(Math.pow(grade - 50, 2.8) + baseCost + 100);
    }
}

// 5. 핵심 엔진 함수
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

async function handleCommand(cmd) {
    if (!cmd) return;
    addLog("나", cmd, "my-msg");
    const lowerCmd = cmd.toLowerCase();

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

    if (gameState.location === 'east' && (lowerCmd.includes("구매") || lowerCmd.includes("사기"))) {
        const idx = parseInt(lowerCmd.replace(/[^0-9]/g, "")) - 1;
        buyItem(idx);
        return;
    }

    if (gameState.location === 'east' && (lowerCmd.includes("판매") || lowerCmd.includes("팔기"))) {
        const idx = parseInt(lowerCmd.replace(/[^0-9]/g, "")) - 1;
        sellItem(idx);
        return;
    }

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

// 6. 게임 기능 로직 (감정 및 판매 리액션 강화)
async function appraiseAtDesk(idx) {
    const item = gameState.inventory[idx];
    if (!item || item.isAppraised) return;

    let requiredIntimacy = 0;
    if (item.grade >= 95) requiredIntimacy = 70; 
    else if (item.grade > 80) requiredIntimacy = 40;

    if (gameState.intimacy < requiredIntimacy) {
        addLog("유나", `이건 딱 봐도 보통 물건이 아니야. 나랑 더 친해지기 전까진 안 봐줄 거야! (필요 친밀도: ${requiredIntimacy})`, "npc-girl");
        return;
    }

    item.value = calculateValue(item.grade);
    item.isAppraised = true;

    let prompt = "";
    if (item.grade >= 95) {
        prompt = `너는 고고학도 유나야. 플레이어 '고'가 무려 '1억원' 가치의 전설적 유물 '${item.name}'을 가져왔어! 평소의 까칠함은 온데간데없고 엄청나게 흥분해서 비명을 지르는 수준으로 리액션을 해줘. 반말로 한 문장.`;
    } else {
        prompt = `너는 고고학도 유나야. 플레이어 '고'가 가져온 '${item.name}'(등급:${item.grade}/100)을 감정해. 50이하은 한심해하고, 51이상은 그럭저럭 인정해줘. 반말로 짧게 한 문장.`;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
        const result = await model.generateContent(prompt);
        addLog("유나", result.response.text().trim(), "npc-girl");
        addLog("시스템", `[감정완료] 가치: ${item.value.toLocaleString()}원!`, "system-msg");
        gameState.exp += (item.grade >= 95 ? 500 : 20);
    } catch (e) {
        addLog("시스템", "감정 오류 발생.", "system-msg");
    }
    updateUI();
}

function sellItem(idx) {
    const item = gameState.inventory[idx];
    if (!item || !item.isAppraised) {
        addLog("할아버지", "감정된 물건이 아니면 살 수 없구려.", "npc-elder");
        return;
    }

    let elderMsg = "";
    if (item.grade >= 95) {
        elderMsg = `허, 허억...! 내 평생 이런 보물은 처음 보는구려! 고, 자네 정말 대단해!`;
    } else if (item.grade > 50) {
        elderMsg = `좋은 물건을 구해왔구먼. 여기 값을 쳐주겠네.`;
    } else {
        elderMsg = `이런 건 고물상에나 가져갈 것이지... 뭐, 일단 받아줌세.`;
    }

    gameState.money += item.value;
    addLog("할아버지", elderMsg, "npc-elder");
    addLog("시스템", `'${item.name}'을 ${item.value.toLocaleString()}원에 판매했습니다.`, "system-msg");
    gameState.inventory.splice(idx, 1);
    updateUI();
}

async function refreshShop() {
    const newItems = [];
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    for (let i = 0; i < 3; i++) {
        const prompt = "낡은 유물 이름을 5자 이내로 하나 지어줘.";
        const result = await model.generateContent(prompt);
        newItems.push({ 
            name: result.response.text().trim(), 
            cost: 200, 
            grade: generateWeightedGrade(), // 가중치 적용 등급 생성
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
        addLog("시스템", `'${item.name}' 구매 완료!`, "system-msg");
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

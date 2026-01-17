import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 보안 설정: 브라우저 저장소 활용
let API_KEY = localStorage.getItem("gemini_api_key");
if (!API_KEY) {
    const inputKey = prompt("Gemini API 키를 입력해주세요.\n(이 키는 본인의 브라우저에만 저장되며 GitHub에는 노출되지 않습니다.)");
    if (inputKey) {
        API_KEY = inputKey.trim();
        localStorage.setItem("gemini_api_key", API_KEY);
    }
}

let genAI = null;
if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
}

// 게임 상태 관리 (gold -> money 통일)
let gameState = {
    location: 'west',
    level: 1,
    exp: 0,
    money: 1000,
    day: 1,
    intimacy: 0,
    inventory: [],
    dailyItems: [], // 상점 물건
    hasQueenGem: false
};

// 2. 장소 및 페르소나 설정 (묘사 구체화)
const locations = {
    west: {
        name: "서쪽 발굴지 (유나의 텐트)",
        description: `낡은 방수포가 펄럭이는 소리가 들립니다. 텐트 안은 발굴용 붓과 정밀 집게로 가득하며, 공기 중에는 오래된 흙먼지와 유나의 화장품 냄새가 미묘하게 섞여 있습니다. 한구석에서 '유나'가 낡은 고문서를 뒤적이고 있습니다.`
    },
    east: {
        name: "동쪽 길목 (잡화점)",
        description: `오래된 나무 향과 놋쇠 냄새가 코를 찌릅니다. 할아버지는 먼지 쌓인 카운터 뒤에서 말없이 안경을 닦고 있습니다. 주변에는 주인을 잃은 유물 조각들이 진열장에 아무렇게나 놓여 있습니다.`
    }
};

const personas = {
    west: () => `너는 17세 여고생 '유나'야. 본명 '고'인 플레이어에게 쌀쌀맞지만 고고학엔 진심이야. 현재 친밀도는 ${gameState.intimacy}%야. 짧고 퉁명스러운 반말로 1~2문장만 말해.`,
    east: () => `너는 신비로운 '골동품점 할아버지'야. 인자하지만 말수가 아주 적어. 반드시 1문장으로 핵심만 짧게 대답해. 플레이어 '고'의 레벨은 ${gameState.level}이야.`
};

// 3. 핵심 엔진 함수
function updateUI() {
    const loc = locations[gameState.location];
    document.getElementById('stat-loc').innerText = loc.name;
    document.getElementById('stat-level').innerText = gameState.level;
    document.getElementById('stat-money').innerText = gameState.money.toLocaleString();
    document.getElementById('stat-time').innerText = `${gameState.day}일차`;
    document.getElementById('stat-intimacy').innerText = gameState.intimacy;
    
    const itemsEl = document.getElementById('items');
    itemsEl.innerHTML = gameState.inventory.map((i, idx) => `<li>[${idx+1}] ${i.name}</li>`).join('');
}

async function handleCommand(cmd) {
    if (!cmd) return;
    addLog("나", cmd, "my-msg");
    const lowerCmd = cmd.toLowerCase();

    // 이동 로직
    if (lowerCmd.includes("오른쪽") || lowerCmd.includes("동쪽") || lowerCmd.includes("east")) {
        gameState.location = 'east';
        addLog("시스템", locations.east.description, "system-msg");
        showShopList();
    } 
    else if (lowerCmd.includes("왼쪽") || lowerCmd.includes("서쪽") || lowerCmd.includes("west")) {
        gameState.location = 'west';
        addLog("시스템", locations.west.description, "system-msg");
    } 
    // 구매 로직
    else if (lowerCmd.includes("구매") || lowerCmd.includes("사기")) {
        const idx = parseInt(lowerCmd.replace(/[^0-9]/g, "")) - 1;
        buyItem(idx);
    } 
    // 감정 로직 (유나의 방에서만 가능)
    else if (lowerCmd.includes("감정") || lowerCmd.includes("팔기")) {
        if (gameState.location !== 'west') {
            addLog("시스템", "감정은 서쪽 텐트의 유나에게 가서 해야 합니다.", "system-msg");
        } else if (gameState.inventory.length > 0) {
            const idx = parseInt(lowerCmd.replace(/[^0-9]/g, "")) - 1 || 0;
            await appraiseItemAI(idx);
        } else {
            addLog("시스템", "감정할 물건이 인벤토리에 없습니다.", "system-msg");
        }
    } 
    else {
        await callGeminiAI(cmd);
    }
    updateUI();
}

// 4. AI 상점 물건 생성 (랜덤 등급 부여)
async function refreshShop() {
    addLog("시스템", "할아버지가 새로운 물건들을 진열합니다...", "system-msg");
    const newItems = [];
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

    for (let i = 0; i < 3; i++) {
        const prompt = "고고학 유적지에서 발견된 낡은 골동품 이름을 딱 하나만 지어줘. 예: 진흙 묻은 단추. 수식어 포함해서 6자 이내로.";
        const result = await model.generateContent(prompt);
        const name = result.response.text().trim();
        
        // 보이지 않는 등급 (1~100)
        const grade = Math.floor(Math.random() * 100) + 1; 
        newItems.push({ name, cost: 200, grade: grade });
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
        gameState.inventory.push({...item}); // 객체 복사해서 인벤토리에 추가
        addLog("시스템", `'${item.name}'을 구매했습니다. 유나에게 가서 감정받으세요.`, "system-msg");
    } else {
        addLog("할아버지", "돈이 모자라거나 물건이 없구려.", "npc-elder");
    }
}

// 5. AI 감정 시스템 (등급에 따른 금액 결정)
async function appraiseItemAI(idx) {
    const item = gameState.inventory[idx];
    if (!item) return;

    const grade = item.grade;
    let value = 0;
    let gradeText = "";

    // 등급에 따른 가치 결정
    if (grade > 90) { value = 1500; gradeText = "전설적인 보물"; }
    else if (grade > 60) { value = 500; gradeText = "희귀한 유물"; }
    else if (grade > 30) { value = 250; gradeText = "평범한 골동품"; }
    else { value = 50; gradeText = "거의 쓰레기"; }

    // 유나에게 감정 대사 요청
    const prompt = `너는 고고학 감정사 유나야. 플레이어가 가져온 '${item.name}'은 사실 '${gradeText}' 등급이야. 
                   이걸 보고 쌀쌀맞게 감정평을 한 문장으로 해줘. 가치는 ${value}원이야.`;
    
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
        const result = await model.generateContent(prompt);
        const yunaReply = result.response.text().trim();

        addLog("유나", yunaReply, "npc-girl");
        addLog("시스템", `[감정결과: ${gradeText}] ${value}원에 판매했습니다! (+경험치 30)`, "system-msg");

        gameState.money += value;
        gameState.exp += 30;
        gameState.inventory.splice(idx, 1);

        if (gameState.exp >= gameState.level * 100) {
            gameState.level++;
            gameState.exp = 0;
            addLog("시스템", `축하합니다! 고고학 레벨이 ${gameState.level}로 올랐습니다!`, "system-msg");
        }
    } catch (e) {
        addLog("시스템", "감정 중 오류가 발생했습니다.", "system-msg");
    }
}

// Gemini AI 일반 대화 (기존 유지)
async function callGeminiAI(userText) {
    const npcName = gameState.location === 'west' ? "유나" : "할아버지";
    const colorClass = gameState.location === 'west' ? "npc-girl" : "npc-elder";

    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-flash-lite-latest",
            systemInstruction: personas[gameState.location]()
        });

        const chatSession = model.startChat({ history: [] });
        const result = await chatSession.sendMessage(userText);
        const reply = result.response.text();

        addLog(npcName, reply, colorClass);

        if (gameState.location === 'west') {
            gameState.intimacy = Math.min(100, gameState.intimacy + 1);
        }
    } catch (e) {
        console.error(e);
        addLog("시스템", "AI가 대답을 거부했습니다. (할당량 초과일 수 있음)", "system-msg");
    }
}

function addLog(sender, msg, className) {
    const logContainer = document.getElementById('chat-log');
    const div = document.createElement('div');
    div.style.marginBottom = "5px";
    div.innerHTML = `<span class="${className}">[${sender}]</span> ${msg}`;
    logContainer.appendChild(div);
    const panel = document.getElementById('log-panel');
    panel.scrollTop = panel.scrollHeight;
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

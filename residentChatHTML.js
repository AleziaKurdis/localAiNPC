//  residentChatHTML.js
//
//  Created by Alezia Kurdis on May 12th, 2026.
//  Copyright 2026 Alezia Kurdis.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html

let currentHistory = [];
let currentNpcName = "";
let userDisplayName = "";
const channel = "ak.residentChat.overte";
let uniqueKey = findGetParameter("key");
if (uniqueKey === null){
    uniqueKey = "";
}

const processingItem = "<div class='processing'><img class='thinking' src='images/think-2.gif'></div>";
const nonProcessingItem = "<div class='processing'><img class='thinking' src='images/nothink.jpg'></div>";


function findGetParameter(parameterName) {
    var result = null,
        tmp = [];
    var items = location.search.substr(1).split("&");
    for (var index = 0; index < items.length; index++) {
        tmp = items[index].split("=");
        if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
    }
    return result;
}

EventBridge.scriptEventReceived.connect(function (message) {
    let data;
    try {
        data = JSON.parse(message);
    } catch (error) {
        console.error("residentChat parsing issue.");
        return;
    }
    if (data.channel === channel && data.key === uniqueKey) {
        if (data.action === "start_typing") {
            //start typing
            document.getElementById("chat").innerHTML = formatChat(currentHistory, currentNpcName) + processingItem;
        } else if (data.action === "stop_typing") {
            //stop typing
            document.getElementById("chat").innerHTML = formatChat(currentHistory, currentNpcName) + nonProcessingItem;
        } else if (data.action === "chat_history") { 
            let theDiv = document.getElementById("chat");
            currentHistory = data.history;
            currentNpcName = data.npcName;
            userDisplayName = data.userDisplayName;
            theDiv.innerHTML = formatChat(data.history, data.npcName) + nonProcessingItem;
            requestAnimationFrame(function () {
                theDiv.scrollTop = theDiv.scrollHeight;
            });
        }
    }
});

function formatChat(history, npcName) {
    if (history.length ===0) {return "";}
    let content = "";
    let entry;
    let className = "";
    let color = "";
    for (let i = 0; i < history.length; i++) {
        if (history[i].startsWith(npcName + ":")) {
            className = "NPC";
            color = ' style="background-color: ' + getColorOfString(npcName) + ';"';
        } else {
            className = "USER";
            color = "";
        }

        entry = extractSpeaker(history[i], npcName, userDisplayName);
        if (entry.timeInfo !== "") {
        content = content + "<div class='timeInfo'>" + entry.timeInfo + "</div>";
        }
        content = content + "<div class='" + className + "'" + color + "><span class='speaker'>" + escapeHtml(entry.owner) + "</span><br>" + escapeHtml(entry.sentence) + "</div>";
        
    }
    return content;
}

function extractSpeaker(str, npcName, userName) {
    let timeinfo = "";
    let spoken = "";
    if (str.startsWith("[")) {
        let cutted = str.split("] ");
        timeinfo = cutted[0].slice(1);
        spoken = cutted[1];
    } else {
        spoken = str;
    }

    const candidates = [npcName, userName];
    let owner;
    for (let i = 0; i < candidates.length; i++) {
        owner = candidates[i] + ":";
        if (spoken.startsWith(owner)) {
            return {
                "timeInfo": timeinfo,
                "owner": owner,
                "sentence": spoken.substring(owner.length).trim()
            };
        }
    }
    return {
        "timeInfo": timeinfo,
        "owner": "",
        "sentence": spoken
    };
}

function emit() {
    let phrase = document.getElementById("inputUser").value;
    if (phrase.length < 1) {
        return;
    }
    EventBridge.emitWebEvent(JSON.stringify({
        "action": "to_emit",
        "phrase": phrase,
        "channel": channel,
        "key": uniqueKey
    }));
    document.getElementById("inputUser").value = "";
}

function handleKey(event) {
    if (event.key === "Enter" && document.getElementById("enterOpt").checked) {
        event.preventDefault();
        emit();
    }
}

function raiseKeyboard() {
    EventBridge.emitWebEvent(JSON.stringify({
        "action": "raise_keyboard",
        "channel": channel,
        "key": uniqueKey
    }));
    document.getElementById("prefocus").style.display = "none";
    document.getElementById("inputUser").focus();
}

function closeKeyboard() {
    EventBridge.emitWebEvent(JSON.stringify({
        "action": "close_keyboard",
        "channel": channel,
        "key": uniqueKey
    }));
    document.getElementById("prefocus").style.display = "block";
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getColorOfString(input) {
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
        sum += input.charCodeAt(i);
    }
    let hue = sum % 360;
    return hslToHex(hue, 100, 20);
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (0 <= h && h < 60) {
        [r, g, b] = [c, x, 0];
    } else if (60 <= h && h < 120) {
        [r, g, b] = [x, c, 0];
    } else if (120 <= h && h < 180) {
        [r, g, b] = [0, c, x];
    } else if (180 <= h && h < 240) {
        [r, g, b] = [0, x, c];
    } else if (240 <= h && h < 300) {
        [r, g, b] = [x, 0, c];
    } else if (300 <= h && h < 360) {
        [r, g, b] = [c, 0, x];
    }
    const toHex = (n) => {
        const hex = Math.round((n + m) * 255).toString(16);
        return hex.padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


EventBridge.emitWebEvent(JSON.stringify({
    "action": "ui_ready",
    "channel": channel,
    "key": uniqueKey
}));


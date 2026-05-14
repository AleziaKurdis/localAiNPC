//
//  residentChat.js
//
//  Created by Alezia Kurdis, April 28th, 2026.
//  Copyright 2026, Alezia Kurdis.
//
//  NPC to chat with a local Ollama or compatible OpenAI-type local endpoints.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//
(function(){
    const ROOT = Script.resolvePath('').split("residentChat.js")[0];
    let entityData = {};
    let chatHistory = [];
    const channel = "ak.residentChat.overte";
    const MEMORY_HISTORY_LENGTH = 100;
    const PURGE_HISTORY_DELAY = 180 * 24 * 3600 * 1000;//180 days
    const SIGNIFICANT_JUMP_IN_TIME = 20 * 60 * 1000; // 20 minutes
    let aiModel = "";
    let aiAPI = "";
    
    let avatarDisplayName = "";
    
    //definition of the NPC (loaded from userData)
    let characterName = "test";
    let characterID = "default";
    let detectionRadius = 6.0; //in meters
    let profile = "You are a mysterious NPC. Speak briefly.";
    let greeting = "Hey! Stranger.";
    let npcModelUrl = "";
    let npcAnimationUrl = "";
    let temperature = 0.7;
    //==========================================
    
    const chatRequirements = "You speak in 1–2 short sentences. Never explain more than asked. Stay in character at all times.";
    
    let typing = false;
    const NOTIFY_SOUND = SoundCache.getSound(ROOT + "sounds/notify.wav");
    let residentChatOverlayWebWindow;
    let distanceCheckerTimer;
    let isInside = false;
    let isClosing = false;
    const WINDOW_POSITION_SETTING = "ak.residentChat.windowPosition";
    const WEB_VR_POSITIONNING_SETTING = "ak.residentChat.webVRPositionning";
    const HISTORY_SETTING = "ak.residentChat.history";
    let lastEncounterTime = 0;
    
    let webUiID = Uuid.NONE;
    const SENSOR_TO_WORLD_MATRIX_INDEX = 65534;
    
    //DEBUGGING: ###########
    const HMD_Debug = false;
    //#####################
    
    this.preload = function (entityID) {
        entityData = Entities.getEntityProperties(entityID, ["id", "rotation", "position", "renderWithZones", "userData"]);
        avatarDisplayName = MyAvatar.displayName;
        if (avatarDisplayName === "") {
            avatarDisplayName = AccountServices.username;
        }
        avatarDisplayName = avatarDisplayName.trim();

        const template = {
            "name": "",
            "id": "",
            "profile": "",
            "greeting": "",
            "context": "",
            "temperature": 0.7,
            "radius": 5.0,
            "npcModelUrl": "",
            "npcAnimationUrl": ""
        };
        if (entityData.userData === "") {
            Entities.editEntity(entityID,{"userData": JSON.stringify(template)});
            entityData.userData = JSON.stringify(template);
        }
        
        getAvailableOpenAIModel();
    };

    function loadProfile() {
        
        let loadedProfile;
        try {
            loadedProfile = JSON.parse(entityData.userData);
        } catch (e) {
            Window.displayAnnouncement("Parsing issue with userData.");
            return;
        }
        
        characterName = loadedProfile.name;
        characterID = loadedProfile.id;
        detectionRadius = loadedProfile.radius;
        profile = "You are " + loadedProfile.name + ". " + loadedProfile.profile + "\nContext: " + loadedProfile.context;
        greeting = loadedProfile.greeting;
        npcModelUrl = loadedProfile.npcModelUrl;
        npcAnimationUrl = loadedProfile.npcAnimationUrl;
        temperature = loadedProfile.temperature;

        chatHistory = loadChatHistory(characterID, characterName);

        if (chatHistory.length < 1) {
            chatHistory[0] = characterName + ": " + greeting;
            lastEncounterTime = 0;
        } else {
            lastEncounterTime = getLastTimeWeChat(characterID, characterName);
        }
    }

    function getLastTimeWeChat(npcId, npcName) {
        let historySetting = Settings.getValue(HISTORY_SETTING, [] );
        let lastTime = 0;
        if (historySetting.length === 0) {
            return lastTime;
        } else {
            for (let i= 0; i < historySetting.length; i++) {
                if (historySetting[i].name === npcName && historySetting[i].id === npcId) {
                    lastTime = historySetting[i].lastInteractionDate;
                    break;
                }
            }
            
            return lastTime;
        }
    }

    function loadChatHistory(npcId, npcName) {
        let historySetting = Settings.getValue(HISTORY_SETTING, [] );

        let historyFound = [];
        if (historySetting.length === 0) {
            return historyFound;
        } else {
            for (let i= 0; i < historySetting.length; i++) {
                if (historySetting[i].name === npcName && historySetting[i].id === npcId) {
                    historyFound = historySetting[i].history;
                    break;
                }
            }
            
            return historyFound;
        }
    }

    function saveChatHistory(npcId, npcName) {
        let timestamp = Date.now();
        let historySetting = Settings.getValue(HISTORY_SETTING, [] );
        if (historySetting.length === 0) {
            historySetting.push({
                "name": npcName,
                "id": npcId,
                "lastInteractionDate": timestamp,
                "history": [...chatHistory]
            });
        } else {
            let found = false;
            for (let i = historySetting.length - 1; i >= 0; i--) {
                if (historySetting[i].name === npcName && historySetting[i].id === npcId) {
                    historySetting[i].history = [...chatHistory];
                    historySetting[i].lastInteractionDate = timestamp;
                    found = true;
                } else {
                    if ((timestamp - historySetting[i].lastInteractionDate) > PURGE_HISTORY_DELAY) {
                        historySetting.splice(i, 1);
                    }
                }
            }
            
            if (!found) {
                historySetting.push({
                    "name": npcName,
                    "id": npcId,
                    "lastInteractionDate": timestamp,
                    "history": [...chatHistory]
                });
            }
        }
        
        Settings.setValue(HISTORY_SETTING, historySetting );
    }

    function initiateNPC() {
        if (aiModel !== "") {
            
            loadProfile();
            
            genAvatar(npcModelUrl, npcAnimationUrl, characterName);
            
            distanceCheckerTimer = Script.setInterval(function () {
                const distance = Vec3.distance(entityData.position, MyAvatar.position);
                if (!isInside && distance < detectionRadius) {
                    isInside = true;
                    displayUi();
                } else if (isInside && distance > detectionRadius + 0.5) {
                    isInside = false;
                    closeUi();
                }
            }, 500);
        } else {
            if (aiAPI === "") {
                getAvailableOllamaModel();
            }
        }
    }

    function getAvailableOllamaModel() {
        const preferred = [
            "llama3:8b",
            "llama3",
            "mistral",
            "phi3"
        ];
        
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "http://localhost:11434/api/tags", true);

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;

            if (xhr.status !== 200) {
                aiModel = "";
                aiAPI = "FINAL";
                initiateNPC();
                return;
            }

            try {
                var data = JSON.parse(xhr.responseText);

                if (!data.models || data.models.length === 0) {
                    aiModel = "";
                    aiAPI = "FINAL";
                    initiateNPC();
                    return;
                }

                var models = data.models
                    .map(function(m) { return m && m.name; })
                    .filter(Boolean);

                // preferred first
                for (var i = 0; i < preferred.length; i++) {
                    var p = preferred[i];
                    var match = models.find(function(m) {
                        return m.toLowerCase().startsWith(p);
                    });
                    if (match) {
                        aiModel = match;
                        aiAPI = "OLLAMA";
                        initiateNPC();
                        return;
                    }
                }

                // fallback
                aiModel = models[0];
                aiAPI = "OLLAMA";
                initiateNPC();

            } catch (e) {
                aiModel = "";
                aiAPI = "FINAL";
                initiateNPC();
            }
        };

        xhr.onerror = function () {
            aiModel = "";
            aiAPI = "FINAL";
            initiateNPC();
        };

        xhr.send();

    }

    function getAvailableOpenAIModel() {
        const preferred = [
            "llama3",
            "mistral",
            "phi3",
            "gpt-oss"
        ];

        var xhr = new XMLHttpRequest();

        // OpenAI-compatible local endpoint
        xhr.open("GET", "http://localhost:1234/v1/models", true);

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;

            if (xhr.status !== 200) {
                aiModel = "";
                aiAPI = "";
                initiateNPC();
                return;
            }

            try {
                var data = JSON.parse(xhr.responseText);

                if (!data.data || data.data.length === 0) {
                    aiModel = "";
                    aiAPI = "";
                    initiateNPC();
                    return;
                }

                var models = data.data
                    .map(function(m) { return m && m.id; })
                    .filter(Boolean);

                // preferred first
                for (var i = 0; i < preferred.length; i++) {
                    var p = preferred[i].toLowerCase();

                    var match = models.find(function(m) {
                        return m.toLowerCase().startsWith(p);
                    });

                    if (match) {
                        aiModel = match;
                        aiAPI = "OPENAI";
                        initiateNPC();
                        return;
                    }
                }

                // fallback
                aiModel = models[0];
                aiAPI = "OPENAI";
                initiateNPC();

            } catch (e) {
                aiModel = "";
                aiAPI = "";
                initiateNPC();
            }
        };

        xhr.onerror = function () {
            aiModel = "";
            aiAPI = "";
            initiateNPC();
        };

        xhr.send();
    }

    function displayUi() {
        if (HMD.active || HMD_Debug) {
            //VR
            if (webUiID === Uuid.NONE) {
                let webPositionning = loadVRWindowPositionning();
                
                webUiID = Entities.addEntity({
                    "type": "Web",
                    "dpi": 19,
                    "name": "Chat with: " + characterName,
                    "parentID": MyAvatar.sessionUUID,
                    "parentJointIndex": SENSOR_TO_WORLD_MATRIX_INDEX,
                    "localPosition": Vec3.multiply( MyAvatar.scale, webPositionning.localPosition),
                    //"position": Vec3.sum(MyAvatar.position, Vec3.multiplyQbyV(MyAvatar.orientation, hmdPanelLocalPosition)),
                    "localRotation": webPositionning.localRotation,
                    "dimensions": Vec3.multiply( MyAvatar.scale, {"x": 0.6, "y": 0.7575, "z": 0.01} ),
                    "isVisibleInSecondaryCamera": false,
                    "sourceUrl": ROOT + "residentChat.html?key=" + entityData.id,
                    "alpha": 1.0,
                    "maxFPS": 30,
                    "wantsKeyboardFocus": true,
                    "showKeyboardFocusHighlight": false,
                    "useBackground": false,
                    "renderLayer": "front"
                }, "local");
                
                Entities.webEventReceived.connect(entitiesWebEventReceiver);
            }
        } else {
            //DESKTOP
            if (residentChatOverlayWebWindow || isClosing) {
                return;
            }
        
            residentChatOverlayWebWindow = new OverlayWebWindow({
                "title": "Chat with: " + characterName,
                "source": ROOT + "residentChat.html?key=" + entityData.id,
                "width": 400,
                "height": 505,
                "useBackground": false
            });
            residentChatOverlayWebWindow.setPosition(
                loadWindowPosition()
            );
            
            residentChatOverlayWebWindow.closed.connect(function () {
                saveWindowPosition(residentChatOverlayWebWindow.getPosition());
                residentChatOverlayWebWindow = null;
                isClosing = false;
            });
            
            residentChatOverlayWebWindow.webEventReceived.connect(webEventReceiver);
        }
    }
    
    function closeUi() {
        if (HMD.active || HMD_Debug) {
            //VR
            if (webUiID !== Uuid.NONE) {
                const windata = Entities.getEntityProperties(webUiID, ["localRotation", "localPosition"]);
                saveVRWindowPositionning(windata.localPosition, windata.localRotation);
                
                Entities.deleteEntity(webUiID);
                webUiID = Uuid.NONE;
                
                Entities.webEventReceived.disconnect(entitiesWebEventReceiver);
                Keyboard.raised = false;
            }
        } else {
            //DESKTOP
            if (residentChatOverlayWebWindow && !isClosing) {
                isClosing = true;
                saveWindowPosition(residentChatOverlayWebWindow.getPosition());
                residentChatOverlayWebWindow.close();
                residentChatOverlayWebWindow.webEventReceived.disconnect(webEventReceiver);
                Keyboard.raised = false;
                
                Script.setTimeout(function () {
                    residentChatOverlayWebWindow = null;
                    isClosing = false;
                }, 200);
            }
        }
    }

    function saveWindowPosition(position) {
        Settings.setValue( WINDOW_POSITION_SETTING, position);
    }

    function loadWindowPosition() {
        return Settings.getValue( WINDOW_POSITION_SETTING, {"x": 100, "y": 100});
    }

    function loadVRWindowPositionning() {
        const defaultValue = {
            "localPosition": {"x": 0.0, "y": 1.0, "z": -1.0}, 
            "localRotation": Quat.fromVec3Degrees({"x": -30, "y": 0, "z": 0})
        };
        
        return Settings.getValue( WEB_VR_POSITIONNING_SETTING, defaultValue);
    }

    function saveVRWindowPositionning(localPosition, localRotation) {
        Settings.setValue( WEB_VR_POSITIONNING_SETTING, {"localPosition": localPosition, "localRotation": localRotation});
    }

    function getPassedTime(timestamp) {
        const deltaTime = Date.now() - timestamp;
        if (deltaTime > SIGNIFICANT_JUMP_IN_TIME) {
            return "[" + getDelayInWords(deltaTime) + " later.] ";
        } else {
            return "";
        }
    }

    function getDelayInWords(milliseconds) {
        const units = [
            { name: "year",   ms: 365 * 24 * 60 * 60 * 1000 },
            { name: "month",  ms: 30 * 24 * 60 * 60 * 1000 },
            { name: "week",   ms: 7 * 24 * 60 * 60 * 1000 },
            { name: "day",    ms: 24 * 60 * 60 * 1000 },
            { name: "hour",   ms: 60 * 60 * 1000 },
            { name: "minute", ms: 60 * 1000 }
        ];

        // Never show below 1 minute
        milliseconds = Math.max(milliseconds, 60 * 1000);

        let parts = [];

        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const value = Math.floor(milliseconds / unit.ms);

            if (value > 0) {
                parts.push(
                    value + " " + unit.name + (value > 1 ? "s" : "")
                );

                milliseconds -= value * unit.ms;

                // Only expose the next smaller unit
                if (parts.length === 2) {
                    break;
                }
            }
        }

        return parts.join(" and ");
    }

    function asking(userText, userDisplayName, npcName, npcPersonality) {
        if (lastEncounterTime > 0) {
            chatHistory.push(getPassedTime(lastEncounterTime) + userDisplayName + ": " + userText);
            lastEncounterTime = 0;
        } else {
            chatHistory.push(userDisplayName + ": " + userText);
        }
        if (chatHistory.length > MEMORY_HISTORY_LENGTH) {
            chatHistory.shift();
        }

        let prompt = npcPersonality + "\n" + chatRequirements + "\n\n" + chatHistory.join("\n") + "\n" + npcName + ":";
        let promptSystem = npcPersonality + "\n" + chatRequirements;
        let promptUser = chatHistory.join("\n") + "\n" + npcName + ":";
        typing = true;
        startTyping();
        
        if (aiAPI === "OLLAMA") {
            askOllama(prompt, npcName);
        } else if (aiAPI === "OPENAI"){
            askOpenAI(promptSystem, promptUser, npcName);
        }
        
        Script.setTimeout(function () {
            if (typing) {
                stopTyping();
                typing = false;
            }
        }, 10000); //10 sec
    }

    function npcSpeak(reply, npcName) {
        if (typing) {
            stopTyping();
            typing = false;
        }

        chatHistory.push(npcName + ": " + reply);
        saveChatHistory(characterID, npcName);
        emitReply();
    }

    function askOllama(prompt, npcName) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "http://localhost:11434/api/generate", true);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                var data = JSON.parse(xhr.responseText);
                var reply = (data.response || "").trim();

                npcSpeak(reply, npcName);
            }
        };

        xhr.send(JSON.stringify({
            "model": aiModel,
            "prompt": prompt,
            "stream": false,
            "options": {
                "temperature": temperature
            }
        }));
    }

    function askOpenAI(promptSystem, promptUser, npcName) {
        var xhr = new XMLHttpRequest();

        // OpenAI-compatible endpoint
        xhr.open("POST", "http://localhost:1234/v1/chat/completions", true);

        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onreadystatechange = function () {

            if (xhr.readyState !== 4) return;

            if (xhr.status !== 200) {
                print("OpenAI API error:", xhr.status, xhr.responseText);
                return;
            }

            try {
                var data = JSON.parse(xhr.responseText);

                var reply = "";

                if (
                    data.choices &&
                    data.choices.length > 0 &&
                    data.choices[0].message
                ) {
                    reply = (data.choices[0].message.content || "").trim();
                }

                npcSpeak(reply, npcName);

            } catch (e) {
                print("Failed to parse OpenAI response:", e);
            }
        };

        xhr.onerror = function () {
            print("Connection error to OpenAI-compatible API");
        };

        xhr.send(JSON.stringify({
            "model": aiModel,
            "messages": [
                {
                    "role": "system",
                    "content": promptSystem
                },
                {
                    "role": "user",
                    "content": promptUser
                }
            ],
            "temperature": temperature,
            "max_tokens": 80,
            "stream": false,
            "stop": [avatarDisplayName + ":"]
        }));
    }

    function startTyping() {
        if (HMD.active || HMD_Debug) {
            if (webUiID !== Uuid.NONE) {
                Entities.emitScriptEvent(webUiID, JSON.stringify({
                    "action": "start_typing",
                    "channel": channel,
                    "key": entityData.id
                }));
            }
        } else {
            if (residentChatOverlayWebWindow) {
                residentChatOverlayWebWindow.emitScriptEvent(JSON.stringify({
                    "action": "start_typing",
                    "channel": channel,
                    "key": entityData.id
                }));
            }
        }
    }

    function stopTyping() {
        if (HMD.active || HMD_Debug) {
            if (webUiID !== Uuid.NONE) {
                Entities.emitScriptEvent(webUiID, JSON.stringify({
                    "action": "stop_typing",
                    "channel": channel,
                    "key": entityData.id
                }));
            }
        } else {
            if (residentChatOverlayWebWindow) {
                residentChatOverlayWebWindow.emitScriptEvent(JSON.stringify({
                    "action": "stop_typing",
                    "channel": channel,
                    "key": entityData.id
                }));
            }
        }
    }

    function emitReply() {
        if (HMD.active || HMD_Debug) {
            if (webUiID !== Uuid.NONE) {
                Entities.emitScriptEvent(webUiID, JSON.stringify({
                    "action": "chat_history",
                    "history": chatHistory,
                    "npcName": characterName,
                    "userDisplayName": avatarDisplayName,
                    "channel": channel,
                    "key": entityData.id
                }));
                playNotificationSound();
            }
        } else {
            if (residentChatOverlayWebWindow) {
                residentChatOverlayWebWindow.emitScriptEvent(JSON.stringify({
                    "action": "chat_history",
                    "history": chatHistory,
                    "npcName": characterName,
                    "userDisplayName": avatarDisplayName,
                    "channel": channel,
                    "key": entityData.id
                }));
                playNotificationSound();
            }
        }
    }

    function playNotificationSound() {
        Audio.playSound(NOTIFY_SOUND, {
            "position": entityData.position,
            "volume": 0.25,
            "localOnly": true,
        });
    }

    function genAvatar(modelUrl, animationUrl, name) {
        let id = Entities.addEntity({
            "name": name,
            "type": "Model",
            "parentID": entityData.id,
            "renderWithZones": entityData.renderWithZones,
            "localPosition": {"x": 0.0 , "y": 0.0, "z": 0.0},
            "modelURL": modelUrl,
            "useOriginalPivot": true,
            "animation": {
                    "url": animationUrl,
                    "fps": 24,
                    "running": true,
                    "loop": true,
                    "allowTranslation": false
                },
            "damping": 0,
            "angularDamping": 0,
            "grab": {
                "grabbable": false
            }
        }, "local");
    }

    function entitiesWebEventReceiver (entityID, message) {
        webEventReceiver (message);
    }

    function webEventReceiver (message) {
        let data;
        try {
            data = JSON.parse(message);
        } catch(e) {
            print("residentChat: Error parsing JSON");
            return;
        }
        if (data.channel === channel && data.key === entityData.id) {
            if (data.action === "to_emit") {
                asking(data.phrase, avatarDisplayName, characterName, profile);
            } else if (data.action === "ui_ready") {
                emitReply();
            } else if (data.action === "raise_keyboard") {
                if (HMD.active) {
                    Keyboard.raised = true;
                }
            } else if (data.action === "close_keyboard") {
                Keyboard.raised = false;
            }
        }
    }

    
    Window.domainChanged.connect(_domainURL => closeUi());

    Window.domainConnectionRefused.connect((_msg, _code, _info) => closeUi());
    
    HMD.displayModeChanged.connect(function (isHMDMode) {
        closeUi();
    });
    
    this.unload = function(entityID) {
        closeUi();
        Script.clearInterval(distanceCheckerTimer);
    };
    
    Script.scriptEnding.connect(() => {
        closeUi();
    });
    
})

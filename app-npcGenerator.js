//
//  app-npcGenerator.js
//
//  Created by Alezia Kurdis, May 7th 2026.
//  Copyright 2026 Overte e.V.
//
//  NPC Generator (local AI) application.
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html
//
(function() {
    var jsMainFileName = "app-npcGenerator.js";
    var ROOT = Script.resolvePath('').split(jsMainFileName)[0];
    
    var APP_NAME = "NPC-GEN";
    var APP_URL = ROOT + "npcGenerator.html";
    var APP_ICON_INACTIVE = ROOT + "images/icon_app_inactive.png";
    var APP_ICON_ACTIVE = ROOT + "images/icon_app_active.png";
    var ICON_CAPTION_COLOR = "#FFFFFF";
    var appStatus = false;
    var channel = "overte.application.more.localNpcGenerator";
    var timestamp = 0;
    var INTERCALL_DELAY = 200; //0.2 sec
    const HISTORY_SETTING = "ak.residentChat.history";
    
    var tablet = Tablet.getTablet("com.highfidelity.interface.tablet.system");
    let colorCaption;
    
    tablet.screenChanged.connect(onScreenChanged);

    var button = tablet.addButton({
        text: APP_NAME,
        icon: APP_ICON_INACTIVE,
        activeIcon: APP_ICON_ACTIVE,
        captionColor: ICON_CAPTION_COLOR
    });


    function clicked(){
        
        if (appStatus === true) {
            tablet.webEventReceived.disconnect(onAppWebEventReceived);
            tablet.gotoHomeScreen();
            colorCaption = ICON_CAPTION_COLOR;
            appStatus = false;
        } else {
            tablet.gotoWebScreen(APP_URL);
            tablet.webEventReceived.disconnect(onAppWebEventReceived);
            tablet.webEventReceived.connect(onAppWebEventReceived);
            colorCaption = "#000000";
            appStatus = true;
        }

        button.editProperties({
            isActive: appStatus,
            captionColor: colorCaption
        });
    }

    button.clicked.connect(clicked);

    function onAppWebEventReceived(message) {
        if (typeof message === "string") {
            var d = new Date();
            var n = d.getTime();
            var instruction = JSON.parse(message);
            if (instruction.channel === channel) {
                if (instruction.action === "GENERATE_NPC" && (n - timestamp) > INTERCALL_DELAY) {
                    d = new Date();
                    timestamp = d.getTime();
                    generateNpc(instruction.soul);
                    Window.displayAnnouncement("NPC generated.");
                } else if (instruction.action === "CLEAR_ALL_HISTORY" && (n - timestamp) > INTERCALL_DELAY) {
                    d = new Date();
                    timestamp = d.getTime();
                    Settings.setValue( HISTORY_SETTING, undefined );
                    Window.displayAnnouncement("All NPC's chat history have been deleted.");
                } else if (instruction.action === "copyText" && (n - timestamp) > INTERCALL_DELAY) {
                    d = new Date();
                    timestamp = d.getTime();
                    Window.copyToClipboard(instruction.copiedText);
                    Window.displayAnnouncement("Copied to clipboard.");
                }
            }
        }
    }

    function generateNpc(soul) {
        let id = Entities.addEntity({
            "type": "Empty",
            "name": "NPC: " + soul.name,
            "position": Vec3.sum(MyAvatar.position, Vec3.multiplyQbyV(MyAvatar.orientation, { x: 0, y: 0, z: -2 })),
            "dimensions": {"x": 2.0, "y": 2.0, "z": 2.0},
            "userData": JSON.stringify(soul),
            "script": ROOT + "residentChat.js",
            "grab": {
                "grabbable": false
            }
        }, "domain");
    }

    function onScreenChanged(type, url) {
        if (type === "Web" && url.indexOf(APP_URL) !== -1) {
            colorCaption = "#000000";
            appStatus = true;

        } else {
            colorCaption = ICON_CAPTION_COLOR;
            appStatus = false;
        }
        
        button.editProperties({
            isActive: appStatus,
            captionColor: colorCaption
        });
    }

    function cleanup() {

        if (appStatus) {
            tablet.gotoHomeScreen();
            tablet.webEventReceived.disconnect(onAppWebEventReceived);
        }

        tablet.screenChanged.disconnect(onScreenChanged);
        tablet.removeButton(button);
    }

    Script.scriptEnding.connect(cleanup);
}());

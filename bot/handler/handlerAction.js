const createFuncMessage = global.utils.message;
const handlerCheckDB = require("./handlerCheckData.js");

module.exports = (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) => {
	const handlerEvents = require("./handlerEvents.js")(api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData);

	async function handleAntiReact(event, api, message) {
		const { config } = global.GoatBot;
		const { antiReact } = config;
		if (!antiReact || !antiReact.enable)
			return;

		const { reaction, userID, messageID: reactMessageID, threadID, senderID } = event;
		if (!reactMessageID)
			return;

		// Skip if userID is 0 (unreact events)
		if (!userID || userID === 0 || userID === '0')
			return;

		// Skip if no reaction (unreact event)
		if (!reaction)
			return;

		// Skip antiReact if this is a command reaction (onReaction system)
		const { onReaction } = global.GoatBot;
		const reactionData = onReaction.get(reactMessageID);
		if (reactionData) {
			// Always skip antiReact for any command reaction
			return; // Let the command reaction system handle this
		}

		// Check thread approval for anti-react
		const { threadApproval } = config;
		if (threadApproval && threadApproval.enable) {
			try {
				const threadData = await threadsData.get(threadID);
				const isAdminBot = global.utils.isAdmin(userID);
				
				// Block anti-react in unapproved threads for non-admins
				if (threadData.approved !== true && !isAdminBot) {
					return;
				}
			} catch (err) {
				console.error(`Thread approval check failed for anti-react in ${threadID}:`, err.message);
			}
		}

		// Check if user is bot admin - use proper admin checking function
		const isAdminBot = antiReact.onlyAdminBot ? global.utils.isAdmin(userID) : true;
		
		try {
			// Handle remove user reaction
			if (antiReact.reactByRemove.enable && reaction === antiReact.reactByRemove.emoji) {
				if (!isAdminBot) {
					const userInfo = await api.getUserInfo(userID);
					const reactorName = userInfo[userID].name;
					message.send(`Hey, ${reactorName}, \n\nthis isn't for you😡`);
					return;
				}
				
				if (senderID && senderID !== api.getCurrentUserID()) {
					await api.removeUserFromGroup(senderID, threadID);
					global.utils.log.info("ANTI REACT", `Admin ${userID} kicked user ${senderID} from group ${threadID}`);
				}
				return;
			}

			// Handle unsend reaction
			if (antiReact.reactByUnsend.enable && antiReact.reactByUnsend.emojis.includes(reaction)) {
				if (!isAdminBot)
					return;
					
				// Check if the message was sent by the bot
				const botID = api.getCurrentUserID();
				const messageInfo = await api.getMessage(threadID, reactMessageID);
				
				if (messageInfo && messageInfo.senderID === botID) {
					await api.unsendMessage(reactMessageID);
					global.utils.log.info("ANTI REACT", `Admin ${userID} unsent bot message ${reactMessageID}`);
				}
			}
		} catch (err) {
			if (!err.message?.includes('field_exception') && !err.message?.includes('Query error') && !err.message?.includes('Cannot retrieve message')) {
				global.utils.log.warn("ANTI REACT", `Failed to process anti-react for message ${reactMessageID}:`, err.message);
			}
		}
	}

	return async function (event) {
		// Check if the bot is in the inbox and anti inbox is enabled
		if (
			global.GoatBot.config.antiInbox == true &&
			(event.senderID == event.threadID || event.userID == event.senderID || event.isGroup == false) &&
			(event.senderID || event.userID || event.isGroup == false)
		)
			return;

		const message = createFuncMessage(api, event);

		await handlerCheckDB(usersData, threadsData, event);
		const handlerChat = await handlerEvents(event, message);
		if (!handlerChat)
			return;

		const {
			onAnyEvent, onFirstChat, onStart, onChat,
			onReply, onEvent, handlerEvent, onReaction,
			typ, presence, read_receipt
		} = handlerChat;


		onAnyEvent();
		switch (event.type) {
			case "message":
			case "message_reply":
			case "message_unsend":
				onFirstChat();
				onChat();
				onStart();
				onReply();
				break;
			case "event":
				handlerEvent();
				onEvent();
				break;
			case "message_reaction":
				await handleAntiReact(event, api, message);
				onReaction();
				break;
			case "typ":
				typ();
				break;
			case "presence":
				presence();
				break;
			case "read_receipt":
				read_receipt();
				break;
			// case "friend_request_received":
			// { /* code block */ }
			// break;

			// case "friend_request_cancel"
			// { /* code block */ }
			// break;
			default:
				break;
		}
	};
};
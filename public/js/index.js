const socket = io()

const divPreGame = document.getElementById('pre-game')
const divMainGame = document.getElementById('main-game')
const divPostGame = document.getElementById('post-game')
const divScreen1 = document.getElementById('screen1')
const divScreen2 = document.getElementById('screen2')

//pre-game
const settingsSevenZero = document.getElementById('create-lobby-settings-seven-zero')
const settingsStackingCards = document.getElementById('create-lobby-settings-stackingcards')
const settingsJumpIn = document.getElementById('create-lobby-settings-jumpin')
const playerNicknameInput = document.getElementById('player-nickname-input')
const createLobbyButton = document.getElementById('create-lobby-button')
const joinLobbyInput = document.getElementById('join-lobby-input')
const joinLobbyButton = document.getElementById('join-lobby-button')
const divScreen2RightPanel = document.getElementById('right-panel')
const startGameButton = document.getElementById('start-game-button')
const showLobbyCode = document.getElementById('show-lobby-code')
const copyLobbyCodeButton = document.getElementById('copy-lobby-code-button')

//main-game
const drawCardButton = document.getElementById('draw-card-button')
const callUnoButton = document.getElementById('call-uno-button')
const challengeUnoButton = document.getElementById('challenge-uno-button')
const playCardButton = document.getElementById('play-card-button')
const keepCardButton = document.getElementById('keep-card-button')

//post-game
const playAgainButton = document.getElementById('play-again-button')

let lobbyCode // code of the game
let nickname // visible nickname of this user
let nicknames // array of users nicknames in lobby
let nicknameId // id of this user in "nicknames" array
let gameInfo // all of the information of the game
let gameSettings // settings of current game - rules
let myCards // array of this user cards
let playersListSpans // array of spans where nicknames are visible

playCardButton.onclick = () => {
    socket.emit('drawn card option', lobbyCode, true)
}

keepCardButton.onclick = () => {
    socket.emit('drawn card option', lobbyCode, false)
}

copyLobbyCodeButton.onclick = () => {
    navigator.clipboard.writeText(showLobbyCode.innerHTML);
}

playAgainButton.onclick = () => {
    socket.emit('play again', lobbyCode)
    socket.emit('start game', lobbyCode, gameSettings)
}

callUnoButton.onclick = () => {
    socket.emit('call uno', lobbyCode)
}

drawCardButton.onclick = () => {
    socket.emit('draw card', lobbyCode)
}

createLobbyButton.onclick = () => {
    nickname = playerNicknameInput.value
    if(nickname !== "") {
        socket.emit('create lobby', nickname)
        divScreen1.style.display = 'none'
        divScreen2.style.display = 'flex'
        startGameButton.style.display = 'block'
    }
}

joinLobbyButton.onclick = () => {
    nickname = playerNicknameInput.value
    if(nickname !== "") {
        lobbyCode = joinLobbyInput.value
        socket.emit('join lobby', lobbyCode, nickname)
    }
}

startGameButton.onclick = () => {
    const lobbySettings = {
        sevenZero: settingsSevenZero.checked ? true : false,
        stackingCards: settingsStackingCards.checked ? true : false,
        jumpIn: settingsJumpIn.checked ? true : false
    }
    socket.emit('start game', lobbyCode, lobbySettings)
}

socket.on('send lobby code', code => {
    lobbyCode = code
    showLobbyCode.innerHTML += lobbyCode
    divScreen1.style.display = 'none'
    divScreen2.style.display = 'flex'
})

socket.on('update players list', nicks => {
    const arr = Array.from(document.getElementsByClassName('span-player-list'))
    arr.forEach(element => element.remove())
    nicknames = nicks;
    nicknames.forEach(nick => {
        let span = document.createElement('span')
        span.innerHTML = nick
        span.classList.add('create-lobby-settings-element', 'span-player-list')
        divScreen2RightPanel.appendChild(span)
    })
    Array.from(document.getElementsByClassName('span-player-list'))[0].innerHTML += ' 👑'
})

socket.on('game started', (nicks, settings, nickId)  => {
    divPreGame.style.display = "none"
    divPostGame.style.display = 'none'
    divMainGame.style.display = "block"
    if(!Object.is(settings, undefined)) gameSettings = settings
    if(!Object.is(nicks, undefined)) {
        nicknames = nicks
        nicknameId = nickId
        nicknames.forEach(() => {
            let span = document.createElement('span')
            span.classList.add('players-list-component')
            divMainGame.appendChild(span)
        })
    }
})

socket.on('cards update', (cards, drawnCard) => {
    myCards = cards
    if(drawnCard !== null) {
        playCardButton.style.display = 'inline'
        keepCardButton.style.display = 'inline'
        myCards.push(drawnCard)
    }
    else {
        keepCardButton.style.display = 'none'
        playCardButton.style.display = 'none'
    }
})

socket.on('game update', info => {
    gameInfo = info

    challengeUnoButton.style.display = 'none'
    for(let i = 0; i < gameInfo.playersUnos.length; i++) {
        if(gameInfo.playersUnos[i] == true && i != nicknameId) {
            challengeUnoButton.style.display = 'block'
            challengeUnoButton.onclick = () => {
                socket.emit('challenge uno', lobbyCode, i)
            }
        }
    }

    callUnoButton.style.display = 'none'
    if(myCards.length == 1 && gameInfo.playersUnos[nicknameId] == true) callUnoButton.style.display = 'block'

    showEverything()
})

socket.on('reset all', () => {
    const elementsToRemove = Array.from(document.getElementsByClassName('temporary-for-game'))
    elementsToRemove.forEach(element => element.remove())
})

socket.on('game over', (winner, makePlayAgainButtonVisible) => {
    divMainGame.style.display = 'none'
    divPostGame.style.display = 'block'
    if(makePlayAgainButtonVisible) playAgainButton.style.display = 'block'
})

function showEverything() {
    showCards()
    showPlayers()
}

function showCards() {
    const myCardsButtons = Array.from(document.getElementsByClassName('card'))
    myCardsButtons.forEach(card => card.remove())

    let discardPileCard = document.createElement("img");
    discardPileCard.src = `/images/cards/${gameInfo.discardPile.color}${gameInfo.discardPile.symbol}.png`;
    discardPileCard.style.width = "40px"
    discardPileCard.style.height = "60px"
    discardPileCard.classList.add('card')
    discardPileCard.classList.add('temporary-for-game')
    divMainGame.appendChild(discardPileCard);

    for(let i = 0; i < myCards.length; i++) {
        let btn = document.createElement('input')
        btn.type = 'image'
        btn.classList.add('card')
        btn.classList.add('temporary-for-game')
        const fileName = myCards[i].color + myCards[i].symbol
        btn.src = `/images/cards/${fileName}.png`
        btn.onclick = () => {
            if(isMovePossible(myCards[i])) {
                socket.emit('play card', lobbyCode, i)
            }
        }
        divMainGame.appendChild(btn)
    }
}

function showPlayers() {
    for(let i = 0; i < nicknames.length; i++) {
        let span = Array.from(document.getElementsByClassName('players-list-component'))[i]
        span.innerHTML = `${nicknames[i]}: ${gameInfo.numberOfPlayersCards[i]}`
        if(gameInfo.turn == i) span.style.fontWeight = 'bold'
        else span.style.fontWeight = 'normal'
    }
}

function isMovePossible(card) {
    return true
}
import MeowCommentsCore from './components/MeowCommentsCore'

function MeowComments() {
    const meowCommentsConfig = {
        baseUrl: 'http://127.0.0.1:8080',
        locale: 'en',
        captcha: 'auto',
        darkMode: true,
    } as const

    return <MeowCommentsCore config={meowCommentsConfig} />
}

function App() {
    return <MeowComments />
}

export default App;

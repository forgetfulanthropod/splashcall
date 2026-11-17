import React, { FormEvent, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { sleep } from '../../utils'
import { imagine } from './api'
import { addCreatedCard, cardFromCreation } from './store'

const Root = styled.div`
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, #d7e8f5 0%, #f7f1e6 100%);
    color: #1d2430;
    overflow: auto;
    touch-action: manipulation;
`

const Form = styled.form`
    box-sizing: border-box;
    min-height: 100%;
    padding: 18vh 24px 140px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
`

const Heading = styled.h1`
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.03em;
`

const Input = styled.input`
    font: inherit;
    font-size: 18px;
    padding: 16px 18px;
    border-radius: 16px;
    border: 1px solid #9aafc0;
    background: #fff;
    color: #1d2430;
    box-shadow: inset 0.15rem 0.15rem 0.4rem rgba(160, 170, 180, 0.45);
    user-select: text;
    -webkit-user-select: text;
    touch-action: manipulation;
    &::placeholder { color: #7d8b99; }
    &:disabled { opacity: 0.7; }
`

const Button = styled.button`
    font: inherit;
    font-size: 18px;
    font-weight: 650;
    padding: 14px 18px;
    border-radius: 999px;
    border: 1px solid #6d8294;
    background: #e7eef5;
    color: #1d2430;
    box-shadow: 0.25rem 0.25rem 0.5rem rgba(160, 170, 180, 0.65), -0.15rem -0.15rem 0.4rem #fff;
    cursor: pointer;
    &:disabled { cursor: default; opacity: 0.65; }
`

const Status = styled.p`
    margin: 0;
    font-size: 16px;
    line-height: 1.4;
`

const ErrorText = styled(Status)`
    color: #9d1c1c;
`

export default function CardCreator(): JSX.Element {
    const [idea, setIdea] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const request = useRef(0)

    useEffect(() => function () { request.current += 1 }, [])

    async function onSubmit(event: FormEvent): Promise<void> {
        event.preventDefault()
        const trimmed = idea.trim()
        if (trimmed.length === 0 || loading) return
        const mine = request.current + 1
        request.current = mine
        setLoading(true)
        setError(null)
        const started = Date.now()
        try {
            const creation = await imagine(trimmed)
            const wait = 400 - (Date.now() - started)
            if (wait > 0) await sleep(wait)
            if (mine !== request.current) return
            const saved = addCreatedCard(cardFromCreation(creation))
            if (!saved) {
                setError('There is not enough room on this phone for another toy. Delete one and try again.')
                return
            }
            setIdea('')
        } catch (err) {
            if (mine !== request.current) return
            const message = err instanceof Error && err.message.length > 0
                ? err.message
                : 'The creator could not finish that. Try again.'
            setError(message)
        } finally {
            if (mine === request.current) setLoading(false)
        }
    }

    return <Root>
        <Form onSubmit={onSubmit} aria-busy={loading}>
            <Heading>Card Creator</Heading>
            <Input
                id="CardCreatorInput"
                aria-label="What do you imagine?"
                placeholder="What do you imagine?"
                value={idea}
                maxLength={400}
                disabled={loading}
                autoComplete="off"
                enterKeyHint="done"
                onChange={event => setIdea(event.target.value)}
            />
            <Button id="CardCreatorButton" type="submit" disabled={loading || idea.trim().length === 0}>
                {loading ? 'Imagining…' : 'Create'}
            </Button>
            {loading && <Status id="CardCreatorLoading">Making something from your idea…</Status>}
            {error != null && <ErrorText id="CardCreatorError" role="alert">{error}</ErrorText>}
        </Form>
    </Root>
}

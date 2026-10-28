import React, { Component, ErrorInfo, ReactNode } from "react"
import { toast } from "react-hot-toast"

interface Props {
    children: ReactNode
    message?: string
}

const defaultMessage = "error occured"

interface State {
    hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    }

    public static getDerivedStateFromError(_: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error("Uncaught error:", error, errorInfo)
        toast.error(this.props.message ?? defaultMessage)
    }

    public render(): React.ReactNode {
        if (this.state.hasError) {
            return <h1>{this.props.message ?? defaultMessage}</h1>
        }
        return this.props.children
    }
}

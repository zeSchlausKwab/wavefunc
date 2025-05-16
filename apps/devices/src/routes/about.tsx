import { createFileRoute } from '@tanstack/react-router'
import { AboutContainer } from '@wavefunc/common'

export const Route = createFileRoute('/about')({
    component: About,
})

function About() {
    return <AboutContainer />
}

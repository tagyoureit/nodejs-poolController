import Link from 'next/link'
const Index = () => (
  <div>
    <p>Hello Next.js</p>
    <p>
      <Link href="/test" prefetch><a>test</a></Link>

    </p>
  </div>
)

export default Index
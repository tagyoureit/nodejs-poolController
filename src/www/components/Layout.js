
import Head from 'next/head';
import Navbar from './Navbar';
import { Container } from 'reactstrap'

// HACK: Reload CSS in development
//       Remove when this issue is resolved:
//       https://github.com/zeit/next-plugins/issues/282
import css from './style.css'


const Layout = (props) => (

    <div>
        <Head>
            <title>Nodejs Pool Controller</title>
            <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
            <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous">
        </link>
        </Head>
        <Navbar counter={props.counter}/>
        <Container>
        
         {props.children}

       
        </Container>
    </div>

)

export default Layout;
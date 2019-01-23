
import Head from 'next/head';
import Navbar from './Navbar';

// HACK: Reload CSS in development
//       Remove when this issue is resolved:
//       https://github.com/zeit/next-plugins/issues/282
import css from './style.css'


const Layout = (props) => (

    <div>
        <Head>
            <title>Nodejs Pool Controller</title>
            <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous">
        </link>
        </Head>
        <Navbar counter={props.counter}/>
        <div className='m-3'>
         {props.children}

        </div>
        
    </div>

)

export default Layout;
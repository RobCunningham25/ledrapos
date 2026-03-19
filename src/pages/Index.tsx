import { Link } from 'react-router-dom';
import { Monitor, Settings, Users } from 'lucide-react';

const navCards = [
  {
    title: 'POS Till',
    description: 'Ring up sales, manage tabs, and process payments',
    icon: Monitor,
    to: '/pos',
  },
  {
    title: 'Admin Panel',
    description: 'Manage products, members, and venue settings',
    icon: Settings,
    to: '/admin',
  },
  {
    title: 'Member Portal',
    description: 'View account, credits, and purchase history',
    icon: Users,
    to: '/member-portal',
  },
];

const Index = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-4">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-primary">LedraPOS</h1>
        <p className="mt-2 text-lg text-muted-foreground">VAL Cruising Association</p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
        {navCards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group flex flex-col items-center rounded-lg border border-border bg-card p-6 shadow-subtle transition-shadow hover:shadow-md"
          >
            <card.icon className="mb-4 h-10 w-10 text-primary opacity-80 group-hover:opacity-100" />
            <h2 className="text-lg font-semibold text-card-foreground">{card.title}</h2>
            <p className="mt-1 text-center text-sm text-muted-foreground">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Index;

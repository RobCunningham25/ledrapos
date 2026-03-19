import { Link } from 'react-router-dom';
import { Monitor, Settings } from 'lucide-react';
import { useVenue } from '@/contexts/VenueContext';

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
];

const Index = () => {
  const { venueName } = useVenue();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-4">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-primary">LedraPOS</h1>
        <p className="mt-2 text-lg text-muted-foreground">{venueName}</p>
      </div>

      <div className="flex w-full max-w-2xl justify-center gap-6">
        {navCards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group flex w-full max-w-xs flex-col items-center rounded-lg border border-border bg-card p-6 shadow-subtle transition-shadow hover:shadow-md"
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
